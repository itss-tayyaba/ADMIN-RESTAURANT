const express = require("express");
const router = express.Router();

const Order = require("../models/Order");
const AdminUser = require("../models/AdminUser");
const jwt = require("jsonwebtoken");
const { autoAssignOrder } = require("./delivery");
const { isAdminRole, resolveBranchId } = require("../utils/branchScope");
const { addTenantScope } = require("../utils/tenantScope");
const { notifyCustomer } = require("../services/notificationService");

// =====================================
// CHEF AUTH
// =====================================

const kitchenAuth = async (req, res, next) => {

    try {

        const token = req.headers.authorization?.split(" ")[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "No token provided"
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (decoded.role !== "chef") {
            return res.status(403).json({
                success: false,
                message: "Chef access only."
            });
        }

        // Read the current staff record rather than trusting a branchId in an
        // old JWT. A chef is never allowed to fall back to another branch.
        const chef = await AdminUser.findOne({ _id: decoded.id, role: "chef", active: true }).select("branchId tenantId");
        if (!chef?.branchId) {
            return res.status(403).json({
                success: false,
                message: "This kitchen account is not assigned to a branch. Ask a superadmin to assign it."
            });
        }
        req.user = { ...decoded, branchId: String(chef.branchId), tenantId: chef.tenantId ? String(chef.tenantId) : decoded.tenantId };

        next();

    } catch (err) {

        return res.status(401).json({
            success: false,
            message: "Invalid token"
        });

    }

};


// =====================================
// ADMIN AUTH
// =====================================

const adminAuth = (req, res, next) => {

    try {

        const token = req.headers.authorization?.split(" ")[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "No token provided"
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (!isAdminRole(decoded.role)) {
            return res.status(403).json({
                success: false,
                message: "Admin access only."
            });
        }

        req.user = decoded;

        next();

    } catch (err) {

        return res.status(401).json({
            success: false,
            message: "Invalid token"
        });

    }

};

// =====================================
// ADMIN: MANAGE CHEF ACCOUNTS
// =====================================
async function chefScope(req) {
    const branchId = resolveBranchId(req.user, req.query);
    const scope = { role: "chef" };
    if (branchId) scope.branchId = branchId;
    const tenantId = req.user.role === "superadmin" ? (req.query.tenantId || null) : req.user.tenantId;
    if (tenantId) await addTenantScope(scope, tenantId);
    return scope;
}

router.get("/chefs", adminAuth, async (req, res) => {
    try {
        const chefs = await AdminUser.find(await chefScope(req))
            .select("name username email phone active branchId createdAt")
            .sort({ createdAt: -1 });
        res.json({ success: true, chefs });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post("/chefs", adminAuth, async (req, res) => {
    try {
        const { username, password, name, email, phone } = req.body;
        if (!username?.trim() || !password) return res.status(400).json({ success: false, message: "Username and password are required." });
        const branchId = req.user.role === "superadmin" ? req.body.branchId : req.user.branchId;
        if (!branchId) return res.status(400).json({ success: false, message: "A branch is required when adding a chef." });

        const Branch = require("../models/Branch");
        const branch = await Branch.findById(branchId).select("tenantId");
        if (!branch || (req.user.role !== "superadmin" && String(branch.tenantId) !== String(req.user.tenantId))) {
            return res.status(404).json({ success: false, message: "Branch not found." });
        }
        const cleanUsername = username.trim();
        if (await AdminUser.findOne({ tenantId: branch.tenantId, username: cleanUsername })) {
            return res.status(409).json({ success: false, message: "That username is already taken." });
        }
        const chef = await AdminUser.create({ username: cleanUsername, password, name: name?.trim() || cleanUsername, email: email?.trim() || "", phone: phone?.trim() || "", role: "chef", active: true, tenantId: branch.tenantId, branchId });
        res.status(201).json({
            success: true,
            message: `${chef.name} was added as a chef.`,
            chef: { _id: chef._id, name: chef.name, username: chef.username, email: chef.email, phone: chef.phone, active: chef.active }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.put("/chefs/:id", adminAuth, async (req, res) => {
    try {
        const chef = await AdminUser.findOne({ _id: req.params.id, ...(await chefScope(req)) });
        if (!chef) return res.status(404).json({ success: false, message: "Chef not found." });
        const { name, email, phone } = req.body;
        if (typeof name === "string" && name.trim()) chef.name = name.trim();
        if (typeof email === "string") chef.email = email.trim();
        if (typeof phone === "string") chef.phone = phone.trim();
        await chef.save();
        res.json({
            success: true,
            message: `${chef.name || chef.username}'s details were updated.`,
            chef: { _id: chef._id, name: chef.name, username: chef.username, email: chef.email, phone: chef.phone, active: chef.active }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.put("/chefs/:id/toggle", adminAuth, async (req, res) => {
    try {
        const chef = await AdminUser.findOne({ _id: req.params.id, ...(await chefScope(req)) });
        if (!chef) return res.status(404).json({ success: false, message: "Chef not found." });
        chef.active = !chef.active;
        await chef.save();
        res.json({
            success: true,
            message: `${chef.name || chef.username} is now ${chef.active ? "active" : "inactive"}.`,
            chef: { _id: chef._id, name: chef.name, username: chef.username, email: chef.email, phone: chef.phone, active: chef.active }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});



// =====================================
// GET ALL KITCHEN ORDERS
// Chef Dashboard
// =====================================

router.get("/orders", kitchenAuth, async (req, res) => {

    try {


        const filter = {
            branchId: req.user.branchId,
            status: {
                $in: [
                    "pending_admin",
                    "pending_kitchen",
                    "received",
                    "preparing",
                    "ready"
                ]
            }
        };
        if (req.user.tenantId) await addTenantScope(filter, req.user.tenantId);
        const orders = await Order.find(filter)

        .populate(
            "customer",
            "name email phone"
        )

        .sort({
            createdAt: -1
        });



        res.json({

            success: true,

            orders

        });



    } catch (error) {


        res.status(500).json({

            success:false,

            message:error.message

        });


    }

});




// =====================================
// ACCEPT ORDER
// pending_kitchen --> preparing
// =====================================

router.put("/:id/accept", kitchenAuth, async (req,res)=>{


    try{


        const orderFilter = { _id: req.params.id, branchId: req.user.branchId };
        if (req.user.tenantId) await addTenantScope(orderFilter, req.user.tenantId);
        const order = await Order.findOne(orderFilter);



        if(!order){

           return res.status(404).json({
    success: false,
    message: "Order not found"
});

        }


if (!["pending_kitchen", "received"].includes(order.status)) {

    return res.status(400).json({
        success: false,
        message: "Only admin-approved orders can be accepted."
    });

}

order.status = "preparing";


        order.statusLog.push({

            status:"preparing",

            time:new Date()

        });



        await order.save();
        await notifyCustomer(order, "preparing");

        // emit real-time update to connected clients
        try {
            const io = req.app && req.app.locals && req.app.locals.io;
            if (io) io.emit('order:update', order);
        } catch (e) { /* ignore emit errors */ }

        res.json({
            success:true,
            message:"Order accepted. Cooking started.",
            order
        });



    }
    catch(error){


        res.status(500).json({
    success: false,
    message: error.message
});


    }


});




// =====================================
// MARK ORDER READY
// preparing --> ready
// =====================================

router.put("/:id/prepared", kitchenAuth, async(req,res)=>{


    try{


        const orderFilter = { _id: req.params.id, branchId: req.user.branchId };
        if (req.user.tenantId) await addTenantScope(orderFilter, req.user.tenantId);
        const order = await Order.findOne(orderFilter);



        if(!order){


            return res.status(404).json({

                message:"Order not found"

            });


        }



        if (order.status !== "preparing") {

    return res.status(400).json({
        success: false,
        message: "Only preparing orders can be marked ready."
    });

}

order.status = "ready";



        order.statusLog.push({

            status:"ready",

            time:new Date()

        });



        await order.save();
        await notifyCustomer(order, "ready");

        const io = req.app && req.app.locals && req.app.locals.io;

        // emit real-time update to connected clients
        try {
            if (io) io.emit('order:update', order);
        } catch (e) { /* ignore emit errors */ }

        // Delivery orders auto-assign a rider the moment they're ready,
        // matching the "Create Order -> Assign Rider" flow: no admin click
        // needed. If no rider is free in the region right now, the order
        // just stays "ready" and can be assigned later (auto-retry or
        // manual) from the delivery/admin portal.
        let assignedRider = null;
        if (order.orderType === "delivery" && order.region) {
            try {
                assignedRider = await autoAssignOrder(order, io);
            } catch (e) { /* assignment failure shouldn't block the kitchen flow */ }
        }

        res.json({
            success:true,
            message: assignedRider
                ? `Order prepared and auto-assigned to ${assignedRider.name || assignedRider.username}.`
                : "Order prepared successfully",
            order,
            rider: assignedRider
                ? { id: assignedRider._id, name: assignedRider.name || assignedRider.username }
                : null
        });



    }
    catch(error){


        res.status(500).json({

            message:error.message

        });


    }


});




// =====================================
// ADMIN MONITOR ALL ORDERS
// =====================================

router.get("/admin/orders", adminAuth, async (req, res) => {


    try{

        const branchId = resolveBranchId(req.user, req.query);
        const filter = branchId ? { branchId } : {};
        const tenantId = req.user.role === 'superadmin' ? (req.query.tenantId || null) : req.user.tenantId;
        if (tenantId) await addTenantScope(filter, tenantId);

        const orders = await Order.find(filter)

        .populate(
            "customer",
            "name email phone"
        )

        .sort({

            createdAt:-1

        });



        res.json({

            success:true,

            orders

        });



    }
    catch(error){


        res.status(500).json({

            message:error.message

        });


    }


});




module.exports = router;
