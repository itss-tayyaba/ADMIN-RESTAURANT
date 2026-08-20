const express = require("express");
const router = express.Router();

const Order = require("../models/Order");
const AdminUser = require("../models/AdminUser");
const jwt = require("jsonwebtoken");
const REGIONS = require("../data/regions");
const { isAdminRole, resolveBranchId } = require("../utils/branchScope");

// A rider can't hold more than this many active ("out-for-delivery") orders
// at once. Once they hit this cap they're skipped by auto-assignment until
// they mark something delivered.
const MAX_ACTIVE_ORDERS = 5;

// =====================================
// DELIVERY BOY AUTH
// =====================================

const deliveryAuth = (req, res, next) => {

    try {

        const token = req.headers.authorization?.split(" ")[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "No token provided"
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (decoded.role !== "delivery") {
            return res.status(403).json({
                success: false,
                message: "Delivery access only."
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
// AUTO-ASSIGN ALGORITHM
//
// 1. Order comes in for a region (set at checkout).
// 2. Find delivery boys fixed to that region (region is set by admin only).
// 3. Remove riders who already have MAX_ACTIVE_ORDERS active orders.
// 4. Of what's left, pick the rider with the fewest active orders.
// 5. Assign the order to them and bump their active order count.
// =====================================

async function findBestRiderForRegion(region, branchId) {

    if (!region) return null;

    return AdminUser.findOne({
        role: "delivery",
        active: true,
        region,
        branchId,
        activeOrders: { $lt: MAX_ACTIVE_ORDERS }
    }).sort({ activeOrders: 1, createdAt: 1 });

}

async function autoAssignOrder(order, io) {

    if (!order || order.orderType !== "delivery" || !order.region) return null;
    if (order.deliveryBoy) return null; // already assigned

    const rider = await findBestRiderForRegion(order.region, order.branchId);

    if (!rider) return null;

    order.status = "out-for-delivery";
    order.deliveryBoy = rider._id;
    order.deliveryBoyName = rider.name || rider.username;
    order.deliveryBoyPhone = rider.phone || '';
    order.assignedAt = new Date();

    order.statusLog.push({
        status: "out-for-delivery",
        time: new Date()
    });

    await order.save();

    rider.activeOrders += 1;
    await rider.save();

    try {
        if (io) io.emit('order:update', order);
    } catch (e) { /* ignore emit errors */ }

    return rider;

}


// =====================================
// ADMIN: LIST DELIVERY RIDERS (full detail)
// =====================================

router.get("/riders", adminAuth, async (req, res) => {

    try {

        const branchId = resolveBranchId(req.user, req.query);
        const filter = { role: "delivery" };
        if (branchId) filter.branchId = branchId;

        const riders = await AdminUser.find(filter)
            .select("name username region phone activeOrders active branchId createdAt")
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            riders,
            maxActiveOrders: MAX_ACTIVE_ORDERS,
            regions: REGIONS
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});


// =====================================
// ADMIN: ADD A NEW DELIVERY RIDER
// A rider is only created from the admin side, with a fixed region.
// =====================================

router.post("/riders", adminAuth, async (req, res) => {

    try {

        const { username, password, name, region, phone } = req.body;

        if (!username || !password || !region) {
            return res.status(400).json({
                success: false,
                message: "Username, password and region are required."
            });
        }

        if (!REGIONS.includes(region)) {
            return res.status(400).json({
                success: false,
                message: "Please choose a valid region."
            });
        }

        // A branch admin's riders always belong to their own branch. A
        // superadmin has no home branch, so they must say which branch this
        // new rider is for.
        const branchId = req.user.role === "superadmin"
            ? req.body.branchId
            : req.user.branchId;

        if (!branchId) {
            return res.status(400).json({
                success: false,
                message: "branchId is required when adding a rider as a superadmin."
            });
        }

        const existing = await AdminUser.findOne({ username });

        if (existing) {
            return res.status(409).json({
                success: false,
                message: "That username is already taken."
            });
        }

        const rider = await AdminUser.create({
            username,
            password,
            name: name || username,
            role: "delivery",
            region,
            phone: phone || '',
            active: true,
            branchId
        });

        res.status(201).json({
            success: true,
            message: `${rider.name} added to ${rider.region}.`,
            rider: {
                _id: rider._id,
                name: rider.name,
                username: rider.username,
                region: rider.region,
                phone: rider.phone,
                activeOrders: rider.activeOrders,
                active: rider.active
            }
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});


// =====================================
// ADMIN: EDIT A RIDER (name and/or region)
// Only the admin can rename a rider or move them to a different region.
// =====================================

router.put("/riders/:id/region", adminAuth, async (req, res) => {

    try {

        const { region, name, phone } = req.body;

        if (!REGIONS.includes(region)) {
            return res.status(400).json({
                success: false,
                message: "Please choose a valid region."
            });
        }

        const branchIdFilter = resolveBranchId(req.user, req.query);
        const riderQuery = { _id: req.params.id, role: "delivery" };
        if (branchIdFilter) riderQuery.branchId = branchIdFilter;

        const rider = await AdminUser.findOne(riderQuery);

        if (!rider) {
            return res.status(404).json({
                success: false,
                message: "Delivery rider not found"
            });
        }

        if (typeof name === "string" && name.trim()) {
            rider.name = name.trim();
        }

        if (typeof phone === "string") {
            rider.phone = phone.trim();
        }

        rider.region = region;
        await rider.save();

        res.json({
            success: true,
            message: `${rider.name || rider.username}'s details were updated.`,
            rider
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});


// =====================================
// ADMIN: ACTIVATE / DEACTIVATE A RIDER
// =====================================

router.put("/riders/:id/toggle", adminAuth, async (req, res) => {

    try {

        const branchIdFilter = resolveBranchId(req.user, req.query);
        const riderQuery = { _id: req.params.id, role: "delivery" };
        if (branchIdFilter) riderQuery.branchId = branchIdFilter;

        const rider = await AdminUser.findOne(riderQuery);

        if (!rider) {
            return res.status(404).json({
                success: false,
                message: "Delivery rider not found"
            });
        }

        rider.active = !rider.active;
        await rider.save();

        res.json({
            success: true,
            message: `${rider.name || rider.username} is now ${rider.active ? "active" : "inactive"}.`,
            rider
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});


// =====================================
// DELIVERY BOY: GET MY OWN PROFILE
// (so the portal can show their fixed region)
// =====================================

router.get("/me", deliveryAuth, async (req, res) => {

    try {

        const rider = await AdminUser.findById(req.user.id)
            .select("name username region phone activeOrders active");

        if (!rider) {
            return res.status(404).json({
                success: false,
                message: "Rider not found"
            });
        }

        res.json({
            success: true,
            rider,
            maxActiveOrders: MAX_ACTIVE_ORDERS
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});


// =====================================
// ADMIN: ASSIGN ORDER TO RIDER
// ready --> out-for-delivery
// =====================================

router.put("/:id/assign", adminAuth, async (req, res) => {

    try {

        const { riderId } = req.body;

        if (!riderId) {
            return res.status(400).json({
                success: false,
                message: "riderId is required"
            });
        }

        const branchIdFilter = resolveBranchId(req.user, req.query);

        const riderQuery = { _id: riderId, role: "delivery" };
        if (branchIdFilter) riderQuery.branchId = branchIdFilter;
        const rider = await AdminUser.findOne(riderQuery);

        if (!rider) {
            return res.status(404).json({
                success: false,
                message: "Delivery rider not found"
            });
        }

        if (rider.activeOrders >= MAX_ACTIVE_ORDERS) {
            return res.status(400).json({
                success: false,
                message: `${rider.name || rider.username} is already at full capacity (${rider.activeOrders}/${MAX_ACTIVE_ORDERS}).`
            });
        }

        const orderQuery = { _id: req.params.id };
        if (branchIdFilter) orderQuery.branchId = branchIdFilter;
        const order = await Order.findOne(orderQuery);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        if (order.orderType === "delivery" && order.region && rider.region !== order.region) {
            return res.status(400).json({
                success: false,
                message: `${rider.name || rider.username} is registered for ${rider.region || "no region"}, not ${order.region}. Add a rider for ${order.region} first, then assign the order to them.`
            });
        }

        if (!["ready", "out-for-delivery"].includes(order.status)) {
            return res.status(400).json({
                success: false,
                message: "Only orders that are ready can be assigned for delivery."
            });
        }

        // If this order was already assigned to a different rider, free that
        // rider's slot back up before handing it to the new one.
        if (order.deliveryBoy && String(order.deliveryBoy) !== String(rider._id)) {
            await AdminUser.findByIdAndUpdate(order.deliveryBoy, { $inc: { activeOrders: -1 } });
        }

        order.status = "out-for-delivery";
        order.deliveryBoy = rider._id;
        order.deliveryBoyName = rider.name || rider.username;
        order.deliveryBoyPhone = rider.phone || '';
        order.assignedAt = new Date();

        order.statusLog.push({
            status: "out-for-delivery",
            time: new Date()
        });

        await order.save();

        rider.activeOrders += 1;
        await rider.save();

        try {
            const io = req.app && req.app.locals && req.app.locals.io;
            if (io) io.emit('order:update', order);
        } catch (e) { /* ignore emit errors */ }

        res.json({
            success: true,
            message: `Order assigned to ${order.deliveryBoyName}.`,
            order
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});


// =====================================
// DELIVERY BOY: GET MY ORDERS
// (assigned to me, active + recently delivered)
// =====================================

router.get("/orders", deliveryAuth, async (req, res) => {

    try {

        const orders = await Order.find({
            deliveryBoy: req.user.id,
            status: { $in: ["out-for-delivery", "delivered", "completed"] }
        })

        .populate("customer", "name email phone")

        .sort({ createdAt: -1 })

        .limit(50);

        res.json({
            success: true,
            orders
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});


// =====================================
// DELIVERY BOY: MARK DELIVERED
// out-for-delivery --> delivered
// =====================================

// Updated only by the assigned rider while they have an active delivery.
router.put("/location", deliveryAuth, async (req, res) => {
    try {
        const { latitude, longitude } = req.body || {};
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
            || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            return res.status(400).json({ success: false, message: "Invalid rider coordinates." });
        }
        const update = await Order.updateMany(
            { deliveryBoy: req.user.id, status: "out-for-delivery" },
            { $set: { riderLocation: { type: "Point", coordinates: [longitude, latitude], updatedAt: new Date() } } }
        );
        if (!update.matchedCount) return res.status(409).json({ success: false, message: "There is no active delivery to share." });
        res.json({ success: true, updatedAt: new Date() });
    } catch (_) {
        res.status(500).json({ success: false, message: "Could not update live location." });
    }
});

router.put("/:id/delivered", deliveryAuth, async (req, res) => {

    try {

        const otp = String(req.body?.otp || '').trim();
        if (!/^\d{6}$/.test(otp)) {
            return res.status(400).json({
                success: false,
                message: "Enter the 6-digit OTP provided by the customer."
            });
        }

        // otp is select:false and is retrieved only for this comparison.
        const order = await Order.findById(req.params.id).select("+otp");

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        if (String(order.deliveryBoy) !== String(req.user.id)) {
            return res.status(403).json({
                success: false,
                message: "This order is not assigned to you."
            });
        }

        if (order.status !== "out-for-delivery") {
            return res.status(400).json({
                success: false,
                message: "Only orders out for delivery can be marked delivered."
            });
        }

        if (!order.otp || order.otp !== otp) {
            return res.status(400).json({
                success: false,
                message: "Invalid OTP. Please ask the customer to confirm the code."
            });
        }

        // OTP verification is the proof of handoff. Record the delivery,
        // then complete the customer journey immediately.
        order.status = "completed";
        order.deliveredAt = new Date();
        order.otpVerified = true;
        order.riderLocation = undefined;

        order.statusLog.push({
            status: "delivered",
            time: new Date()
        });
        order.statusLog.push({
            status: "completed",
            time: new Date()
        });

        await order.save();

        // Free up a slot for this rider so they can be auto-assigned again.
        await AdminUser.findByIdAndUpdate(req.user.id, {
            $inc: { activeOrders: -1 }
        });
        await AdminUser.updateOne(
            { _id: req.user.id, activeOrders: { $lt: 0 } },
            { $set: { activeOrders: 0 } }
        );

        // This query selected the secret solely for verification. Do not
        // expose it through the response or the realtime event.
        const safeOrder = order.toObject();
        delete safeOrder.otp;

        try {
            const io = req.app && req.app.locals && req.app.locals.io;
            if (io) io.emit('order:update', safeOrder);
        } catch (e) { /* ignore emit errors */ }

        res.json({
            success: true,
            message: "OTP verified. Delivery completed successfully.",
            order: safeOrder
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});


// =====================================
// ADMIN: RETRY AUTO-ASSIGN
// Useful when an order was "ready" but no rider was free in its region yet.
// =====================================

router.put("/:id/auto-assign", adminAuth, async (req, res) => {

    try {

        const branchIdFilter = resolveBranchId(req.user, req.query);
        const orderQuery = { _id: req.params.id };
        if (branchIdFilter) orderQuery.branchId = branchIdFilter;
        const order = await Order.findOne(orderQuery);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        if (order.status !== "ready") {
            return res.status(400).json({
                success: false,
                message: "Only orders that are ready can be auto-assigned."
            });
        }

        if (!order.region) {
            return res.status(400).json({
                success: false,
                message: "This order has no region set, so it can't be auto-assigned."
            });
        }

        const io = req.app && req.app.locals && req.app.locals.io;
        const rider = await autoAssignOrder(order, io);

        if (!rider) {
            return res.status(409).json({
                success: false,
                message: `No available rider in ${order.region} right now (all full or none registered).`
            });
        }

        res.json({
            success: true,
            message: `Order auto-assigned to ${rider.name || rider.username} (${rider.activeOrders}/${MAX_ACTIVE_ORDERS}).`,
            order
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});


// =====================================
// ADMIN: MONITOR ALL DELIVERY ORDERS
// =====================================

router.get("/admin/orders", adminAuth, async (req, res) => {

    try {

        const branchId = resolveBranchId(req.user, req.query);
        const filter = { status: { $in: ["ready", "out-for-delivery", "delivered"] } };
        if (branchId) filter.branchId = branchId;

        const orders = await Order.find(filter)

        .populate("customer", "name email phone")

        .populate("deliveryBoy", "name username")

        .sort({ createdAt: -1 });

        res.json({
            success: true,
            orders
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});


module.exports = router;
module.exports.autoAssignOrder = autoAssignOrder;