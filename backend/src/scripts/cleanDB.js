import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const cleanDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✓ Connected to MongoDB");

    // Get all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`\nFound ${collections.length} collections. Dropping all...\n`);

    // Drop each collection
    for (const collection of collections) {
      await mongoose.connection.db.dropCollection(collection.name);
      console.log(`✓ Dropped collection: ${collection.name}`);
    }

    console.log("\n✅ Database cleaned successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error cleaning database:", error.message);
    process.exit(1);
  }
};

cleanDB();
