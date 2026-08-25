const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const adminUserSchema = new mongoose.Schema(
{
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },

    password: {
        type: String,
        required: true
    },

    name: {
        type: String,
        default: ""
    },

    role: {
        type: String,
        enum: ["admin", "chef", "delivery", "superadmin"],
        default: "chef"
    },

    // Which branch this staff member belongs to. Required for every role
    // except superadmin — a superadmin has no home branch (stays null),
    // which is what makes resolveBranchId() treat them as "see everything"
    // by default. Every branch-filtered route (kitchen, delivery, orders)
    // reads this straight off the JWT (see routes/auth.js), so it must be
    // set at creation time or that staff member ends up unscoped.
    branchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Branch",
        default: null,
        index: true
    },

    active: {
        type: Boolean,
        default: true
    },

    // ================================
    // Delivery-only fields
    // ================================

    // The region a rider is fixed to. Only the admin sets/changes this
    // (from the admin panel) — riders cannot change it themselves.
    region: {
        type: String,
        default: null,
        trim: true
    },

    // Rider's contact number. Shown to a customer on the tracking page once
    // an order is out for delivery, so they can reach their delivery boy.
    phone: {
        type: String,
        default: '',
        trim: true
    },

    // How many orders are currently "out-for-delivery" for this rider.
    // Incremented when an order is assigned to them, decremented when
    // they mark it delivered.
    activeOrders: {
        type: Number,
        default: 0,
        min: 0
    }
},
{
    timestamps: true
}
);

// ================================
// Encrypt Password Before Saving
// ================================

adminUserSchema.pre("save", async function(next){

    if(!this.isModified("password"))
        return next();

    try{

        const salt = await bcrypt.genSalt(10);

        this.password = await bcrypt.hash(this.password, salt);

        next();

    }
    catch(err){

        next(err);

    }

});

// ================================
// Compare Password
// ================================

adminUserSchema.methods.comparePassword = async function(password){

    return await bcrypt.compare(password, this.password);

};

// ================================
// Create Default Admin
// ================================

adminUserSchema.statics.createDefaultAdmin = async function(){

    const admin = await this.findOne({ username: "admin" });

    if(!admin){

        const password = process.env.DEFAULT_ADMIN_PASSWORD || "ember2024";
        if (!process.env.DEFAULT_ADMIN_PASSWORD) {
            console.warn("⚠️  DEFAULT_ADMIN_PASSWORD not set — using demo password 'ember2024'. Set it in .env and change it from the admin panel before going live.");
        }

        // Required — createDefaultBranch() is idempotent, so this is safe
        // to call regardless of seeder order at startup.
        const Branch = require("./Branch");
        const defaultBranch = await Branch.createDefaultBranch();

        await this.create({

            username: "admin",

            password,

            name: "Restaurant Administrator",

            role: "admin",

            branchId: defaultBranch._id

        });

        console.log("✅ Default Admin Created");

    }

};

// ================================
// Create Default Chef
// ================================

adminUserSchema.statics.createDefaultChef = async function(){

    const chef = await this.findOne({ username: "chef" });

    if(!chef){

        const password = process.env.DEFAULT_CHEF_PASSWORD || "chef123";
        if (!process.env.DEFAULT_CHEF_PASSWORD) {
            console.warn("⚠️  DEFAULT_CHEF_PASSWORD not set — using demo password 'chef123'. Set it in .env before going live.");
        }

        const Branch = require("./Branch");
        const defaultBranch = await Branch.createDefaultBranch();

        await this.create({

            username: "chef",

            password,

            name: "Head Chef",

            role: "chef",

            branchId: defaultBranch._id

        });

        console.log("✅ Default Chef Created");

    }

};

// ================================
// Create Default Delivery Boy
// ================================

adminUserSchema.statics.createDefaultDelivery = async function(){

    const rider = await this.findOne({ username: "delivery" });

    if(!rider){

        const password = process.env.DEFAULT_DELIVERY_PASSWORD || "delivery123";
        if (!process.env.DEFAULT_DELIVERY_PASSWORD) {
            console.warn("⚠️  DEFAULT_DELIVERY_PASSWORD not set — using demo password 'delivery123'. Set it in .env before going live.");
        }

        const Branch = require("./Branch");
        const defaultBranch = await Branch.createDefaultBranch();

        await this.create({

            username: "delivery",

            password,

            name: "Delivery Rider",

            role: "delivery",

            region: "Gulberg",

            branchId: defaultBranch._id

        });

        console.log("✅ Default Delivery Rider Created");

    }

};

// ================================
// Create Default Superadmin
// ================================

adminUserSchema.statics.createDefaultSuperadmin = async function(){

    const superadmin = await this.findOne({ username: "superadmin" });

    if(!superadmin){

        const password = process.env.DEFAULT_SUPERADMIN_PASSWORD || "superadmin2024";
        if (!process.env.DEFAULT_SUPERADMIN_PASSWORD) {
            console.warn("⚠️  DEFAULT_SUPERADMIN_PASSWORD not set — using demo password 'superadmin2024'. Set it in .env and change it from the login panel before going live.");
        }

        // No Branch lookup here on purpose — a superadmin has no home
        // branch (branchId stays null), which is what makes
        // resolveBranchId() treat them as "see everything" by default.
        await this.create({

            username: "superadmin",

            password,

            name: "Platform Owner",

            role: "superadmin"

        });

        console.log("✅ Default Superadmin Created");

    }

};

module.exports = mongoose.model("AdminUser", adminUserSchema);