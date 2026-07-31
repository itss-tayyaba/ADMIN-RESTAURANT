const mongoose = require("mongoose");

mongoose.connect(
    "mongodb+srv://hamzatabi654_db_user:Hamza123456@cluster0.zk6n6bz.mongodb.net/ember-brew?retryWrites=true&w=majority&appName=Cluster0"
)
.then(() => {
    console.log("✅ MongoDB Connected Successfully!");
    process.exit();
})
.catch((err) => {
    console.log("❌ Connection Failed");
    console.error(err);
    process.exit();
});