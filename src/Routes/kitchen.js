const express = require("express");
const router = express.Router();

const Order = require("../models/Order");
const jwt = require("jsonwebtoken");
const { autoAssignOrder } = require("./delivery");

// =====================================
// CHEF AUTH
// =====================================

const kitchenAuth = (req, res, next) => {

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

        if (decoded.role !== "admin") {
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


        const orders = await Order.find({

            status: {
                $in: [
                    "received",
                    "preparing",
                    "ready"
                ]
            }

        })

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
// received --> preparing
// =====================================

router.put("/:id/accept", kitchenAuth, async (req,res)=>{


    try{


        const order = await Order.findById(req.params.id);



        if(!order){

           return res.status(404).json({
    success: false,
    message: "Order not found"
});

        }


if (order.status !== "received") {

    return res.status(400).json({
        success: false,
        message: "Only received orders can be accepted."
    });

}

order.status = "preparing";


        order.statusLog.push({

            status:"preparing",

            time:new Date()

        });



        await order.save();

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


        const order = await Order.findById(req.params.id);



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


        const orders = await Order.find()

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