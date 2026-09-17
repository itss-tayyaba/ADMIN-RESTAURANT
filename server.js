if (process.env.USE_CUSTOM_DNS === "true") {
  const dns = require("dns");
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
}

require("dotenv").config();

console.log("================================");
console.log("PORT =", process.env.PORT || 3000);
console.log("MONGODB_URI configured =", Boolean(process.env.MONGODB_URI));
console.log("================================");

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const app = express();

const Tenant = require("./src/models/Tenant");
const Branch = require("./src/models/Branch");
const AdminUser = require("./src/models/AdminUser");
const RestaurantTable = require("./src/models/RestaurantTable");

let databaseConnection;
let defaultsSeeded = false;

async function seedDefaults() {
  if (defaultsSeeded) return;
  defaultsSeeded = true;

  try {
    const defaultTenant = await Tenant.createDefaultTenant();
    const defaultBranch = await Branch.createDefaultBranch(defaultTenant._id);
    await AdminUser.createDefaultSuperadmin();
    await AdminUser.createDefaultAdmin(defaultTenant._id, defaultBranch._id);
    await AdminUser.createDefaultChef(defaultTenant._id, defaultBranch._id);
    await AdminUser.createDefaultDelivery(defaultTenant._id, defaultBranch._id);
    console.log("✅ Multi-Tenant & Default Users Ready");
  } catch (err) {
    defaultsSeeded = false;
    console.error("Seeding defaults failed:", err);
  }
}

function connectDatabase() {
  if (mongoose.connection.readyState === 1) {
    return seedDefaults();
  }

  if (!databaseConnection) {
    databaseConnection = mongoose
      .connect(process.env.MONGODB_URI)
      .catch((err) => {
        databaseConnection = null;
        throw err;
      });
  }

  return databaseConnection.then(() => seedDefaults());
}

// Routes
const menuRoutes = require("./src/Routes/menu");
const orderRoutes = require("./src/Routes/orders");
const authRoutes = require("./src/Routes/auth");
const customerAuthRoutes = require("./src/Routes/customerAuth");
const recommendationRoutes = require("./src/Routes/recommendations");
const complaintRoutes = require("./src/Routes/complaints");
const reservationRoutes = require("./src/Routes/reservations");
const tableRoutes = require("./src/Routes/tables");
const kitchenRoutes = require("./src/Routes/kitchen");
const deliveryRoutes = require("./src/Routes/delivery");
const chatbotRoutes = require("./src/Routes/chatbot");
const branchesRoutes = require("./src/Routes/branches");
const notificationRoutes = require("./src/Routes/notifications");
const tenantRoutes = require("./src/Routes/tenants");
const paymentRoutes = require("./src/Routes/payments");

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, "ember-and-brew", "public")));
app.use("/admin", express.static(path.join(__dirname, "ember-and-brew", "public", "admin")));
app.use("/kitchen", express.static(path.join(__dirname, "ember-and-brew", "public", "kitchen")));
app.use("/delivery", express.static(path.join(__dirname, "ember-and-brew", "public", "delivery")));
app.use("/superadmin", (req, res, next) => {
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
}, express.static(path.join(__dirname, "ember-and-brew", "public", "superadmin")));

// Multi-tenant customer routes
app.get("/r/:tenantSlug", (req, res) => {
  res.sendFile(path.join(__dirname, "ember-and-brew", "public", "index.html"));
});
app.get("/r/:tenantSlug/customer", (req, res) => {
  res.sendFile(path.join(__dirname, "ember-and-brew", "public", "customer.html"));
});
app.get("/r/:tenantSlug/order/:branchCode", (req, res) => {
  res.sendFile(path.join(__dirname, "ember-and-brew", "public", "index.html"));
});

app.get("/customer", (req, res) => {
  res.sendFile(path.join(__dirname, "ember-and-brew", "public", "customer.html"));
});
app.get("/customer/:branchCode", (req, res) => {
  res.sendFile(path.join(__dirname, "ember-and-brew", "public", "customer.html"));
});
app.get("/order/:branchCode", (req, res) => {
  res.sendFile(path.join(__dirname, "ember-and-brew", "public", "index.html"));
});

// API Middleware
app.use("/api", (req, res, next) => {
  connectDatabase().then(() => next()).catch(next);
});

app.use("/api/tenants", tenantRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/customer-auth", customerAuthRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use("/api/complaints", complaintRoutes);
app.use("/api/reservations", reservationRoutes);
app.use("/api/tables", tableRoutes);
app.use("/api/kitchen", kitchenRoutes);
app.use("/api/delivery", deliveryRoutes);
app.use("/api/chatbot", chatbotRoutes);
app.use("/api/branches", branchesRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/payments", paymentRoutes);

// Dashboards
app.get("/admin/login", (req, res) => {
  res.sendFile(path.join(__dirname, "ember-and-brew", "public", "admin", "login.html"));
});
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "ember-and-brew", "public", "admin", "index.html"));
});
app.get("/kitchen", (req, res) => {
  res.sendFile(path.join(__dirname, "ember-and-brew", "public", "kitchen", "kitchen.html"));
});
app.get("/delivery", (req, res) => {
  res.sendFile(path.join(__dirname, "ember-and-brew", "public", "delivery", "delivery.html"));
});
app.get("/superadmin", (req, res) => {
  res.sendFile(path.join(__dirname, "ember-and-brew", "public", "superadmin", "superadmin.html"));
});

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
app.set("io", io);

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);
  socket.on("join-branch", (branchId) => {
    if (branchId) socket.join('branch:' + branchId);
  });
  socket.on("join-tenant", (tenantId) => {
    if (tenantId) socket.join('tenant:' + tenantId);
  });
});

if (require.main === module) {
  connectDatabase()
    .then(() => {
      server.listen(PORT, () => {
        console.log('Server running at http://localhost:' + PORT);
      });
    })
    .catch((err) => {
      console.error("Database initialization failed:", err);
      process.exit(1);
    });
}

module.exports = app;
