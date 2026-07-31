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
        enum: ["admin", "chef", "delivery"],
        default: "chef"
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

        await this.create({

            username: "admin",

            password: "ember2024",

            name: "Restaurant Administrator",

            role: "admin"

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

        await this.create({

            username: "chef",

            password: "chef123",

            name: "Head Chef",

            role: "chef"

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

        await this.create({

            username: "delivery",

            password: "delivery123",

            name: "Delivery Rider",

            role: "delivery",

            region: "Gulberg"

        });

        console.log("✅ Default Delivery Rider Created");

    }

};

module.exports = mongoose.model("AdminUser", adminUserSchema);