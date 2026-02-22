import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import UserModel from "../models/User.js";

const mongoUri = process.env.MONGODB_URI || "";
const adminEmail = process.env.ADMIN_EMAIL || "admin@gmail.com";
const adminPassword = process.env.ADMIN_PASSWORD || "Vestord33";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function seed() {
  if (!mongoUri) {
    throw new Error("Missing MONGODB_URI");
  }
  if (!adminEmail || !adminPassword) {
    throw new Error("Missing ADMIN_EMAIL or ADMIN_PASSWORD");
  }
  if (!isValidEmail(adminEmail)) {
    throw new Error("Invalid ADMIN_EMAIL");
  }
  if (adminPassword.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 chars");
  }

  await mongoose.connect(mongoUri);

  const existing = await UserModel.findOne({ email: adminEmail.toLowerCase() });
  if (existing) {
    console.log("Admin user already exists");
    await mongoose.disconnect();
    return;
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const user = await UserModel.create({
    email: adminEmail.toLowerCase(),
    passwordHash,
    role: "admin"
  });

  console.log(`Created admin user: ${user.email}`);
  await mongoose.disconnect();
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
