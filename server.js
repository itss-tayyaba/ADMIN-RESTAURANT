require("dotenv").config();

console.log("================================");
console.log("PORT =", process.env.PORT || 3000);
console.log("MONGODB_URI =", process.env.MONGODB_URI || "not set");
console.log("================================");

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const http = require('http');
const { Server } = require('socket.io');

const app = express();

const AdminUser = require("./src/models/AdminUser");
const RestaurantTable = require("./src/models/RestaurantTable");

// Reuse the connection while a Vercel serverless instance is warm.
let databaseConnection;
function connectDatabase() {
    if (mongoose.connection.readyState === 1) return Promise.resolve();
    if (!databaseConnection) {
        databaseConnection = mongoose.connect(process.env.MONGODB_URI)
            .then(async () => {
                await AdminUser.createDefaultAdmin();
                await AdminUser.createDefaultChef();
                await AdminUser.createDefaultDelivery();
            })
            .catch((err) => {
                databaseConnection = null;
                throw err;
            });
    }
    return databaseConnection;
}

// ===================== ROUTES =====================

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

// ===================== MIDDLEWARE =====================

app.use(cors());

app.use(express.json());

app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    connectDatabase().then(() => next()).catch(next);
});

// ===================== STATIC =====================

app.use(
    express.static(
        path.join(__dirname, "ember-and-brew", "public")
    )
);

// expose admin folder

app.use(
    "/admin",
    express.static(
        path.join(__dirname, "ember-and-brew", "public", "admin")
    )
);

// expose kitchen folder

app.use(
    "/kitchen",
    express.static(
        path.join(__dirname, "ember-and-brew", "public", "kitchen")
    )
);

// expose delivery folder

app.use(
    "/delivery",
    express.static(
        path.join(__dirname, "ember-and-brew", "public", "delivery")
    )
);

// ===================== CUSTOMER PORTAL =====================
app.get('/customer', (req, res) => {
  res.sendFile(path.join(__dirname, 'ember-and-brew', 'public', 'customer.html'));
});

// ===================== API =====================

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

// ===================== LOGIN PAGE =====================

app.get("/admin/login", (req, res) => {

    res.sendFile(

        path.join(
            __dirname,
            "ember-and-brew",
            "public",
            "admin",
            "login.html"
        )

    );

});

// ===================== ADMIN DASHBOARD =====================

app.get("/admin", (req, res) => {

    res.sendFile(

        path.join(
            __dirname,
            "ember-and-brew",
            "public",
            "admin",
            "index.html"
        )

    );

});

// ===================== KITCHEN =====================

app.get("/kitchen", (req, res) => {

    res.sendFile(

        path.join(
            __dirname,
            "ember-and-brew",
            "public",
            "kitchen",
            "kitchen.html"
        )

    );

});

// ===================== DELIVERY =====================

app.get("/delivery", (req, res) => {

    res.sendFile(

        path.join(
            __dirname,
            "ember-and-brew",
            "public",
            "delivery",
            "delivery.html"
        )

    );

});

// ===================== HOME =====================

app.get("/", (req, res) => {

    res.sendFile(

        path.join(
            __dirname,
            "ember-and-brew",
            "public",
            "index.html"
        )

    );

});

// ===================== 404 =====================

app.get("*", (req, res) => {

    res.redirect("/");

});

// ===================== DATABASE =====================

// The persistent HTTP and Socket.IO server is only for local development.
// Vercel imports this module and serves the Express app as a function.
if (require.main === module) {
mongoose.connect(process.env.MONGODB_URI)

.then(async () => {

    console.log("✅ Connected to MongoDB");

    await AdminUser.createDefaultAdmin();

    await AdminUser.createDefaultChef();

    await AdminUser.createDefaultDelivery();

    try {
        const tableCount = await RestaurantTable.countDocuments();
        if (!tableCount) {
            const defaultTables = [
                { tableNumber: 'T-01', seats: 2, area: 'indoor' },
                { tableNumber: 'T-02', seats: 2, area: 'indoor' },
                { tableNumber: 'T-03', seats: 4, area: 'indoor' },
                { tableNumber: 'T-04', seats: 4, area: 'outdoor' },
                { tableNumber: 'T-05', seats: 6, area: 'outdoor' },
                { tableNumber: 'T-06', seats: 8, area: 'indoor' }
            ];
            await RestaurantTable.insertMany(defaultTables);
            console.log('✅ Seeded default restaurant tables');
        }
    } catch (err) {
        console.warn('Could not seed default tables:', err && err.message);
    }

    console.log("✅ Default Users Ready");

    // create HTTP server and attach Socket.IO
    const server = http.createServer(app);
    const io = new Server(server, { cors: { origin: '*' } });

    // make io available to routes via app.locals
    app.locals.io = io;

    server.listen(process.env.PORT || 3000, () => {
        console.log(`🚀 Server Running : http://localhost:${process.env.PORT || 3000}`);
    });

    io.on('connection', (socket) => {
        console.log('Socket connected:', socket.id);
        socket.on('disconnect', () => console.log('Socket disconnected:', socket.id));
    });

})

.catch(err => {

    console.error(err);

});
}

module.exports = app;
