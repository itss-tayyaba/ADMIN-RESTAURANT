// A quick standalone script to verify your MONGODB_URI works before
// running the full server. Never hardcode real credentials here — this
// file is tracked by git (unlike .env), so anything hardcoded in it
// ends up permanently in your repo history.
//
// Usage: node testConnection.js

require("dotenv").config();
const mongoose = require("mongoose");

if (!process.env.MONGODB_URI) {
    console.error("❌ MONGODB_URI is not set. Add it to your .env file first.");
    process.exit(1);
}

mongoose.connect(process.env.MONGODB_URI)
.then(() => {
    console.log("✅ MongoDB Connected Successfully!");
    process.exit(0);
})
.catch((err) => {
    console.log("❌ Connection Failed");
    console.error(err);
    process.exit(1);
});