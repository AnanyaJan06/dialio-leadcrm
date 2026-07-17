import dns from "node:dns";
import mongoose from "mongoose";
import TwilioNumber from "../model/TwilioNumber.js";

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const migrateTwilioNumberAssignments = async () => {
  const legacyNumbers = await TwilioNumber.collection.find({
    assignedTo: { $exists: true, $ne: null }
  }).toArray();

  if (legacyNumbers.length === 0) return;

  for (const number of legacyNumbers) {
    const assignedUsers = Array.isArray(number.assignedUsers) && number.assignedUsers.length > 0
      ? number.assignedUsers
      : [number.assignedTo];

    await TwilioNumber.collection.updateOne(
      { _id: number._id },
      {
        $set: { assignedUsers },
        $unset: { assignedTo: '' }
      }
    );
  }

  console.log(`Migrated ${legacyNumbers.length} Twilio number assignment(s) to assignedUsers.`);
};

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    await migrateTwilioNumberAssignments();
    console.log('✅ MongoDB Connected Successfully');
  } catch (error) {
    console.error('❌ MongoDB Connection Failed:', error.message);
    process.exit(1);
  }
};

export default connectDB;
