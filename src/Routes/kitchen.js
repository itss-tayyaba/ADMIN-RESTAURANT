const express = require("express");
const router = express.Router();

const Order = require("../models/Order");
const AdminUser = require("../models/AdminUser");
const jwt = require("jsonwebtoken");
const { autoAssignOrder } = require("./delivery");
const { isAdminRole, resolveBranchId } = require("../utils/branchScope");
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
        const chef = await AdminUser.findOne({ _id: decoded.id, role: "chef", active: true }).select("branchId");
        if (!chef?.branchId) {
            return res.status(403).json({
                success: false,
                message: "This kitchen account is not assigned to a branch. Ask a superadmin to assign it."
            });
        }
        req.user = { ...decoded, branchId: String(chef.branchId) };

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
