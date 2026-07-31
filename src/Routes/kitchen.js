const express = require("express");
const router = express.Router();

const Order = require("../models/Order");
const jwt = require("jsonwebtoken");

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

           res.status(404).json({
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

        // emit real-time update to connected clients
        try {
            const io = req.app && req.app.locals && req.app.locals.io;
            if (io) io.emit('order:update', order);
        } catch (e) { /* ignore emit errors */ }

        res.json({
            success:true,
            message:"Order prepared successfully",
            order
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