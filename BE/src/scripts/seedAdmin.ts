import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import UserModel from "../models/User.js";

const mongoUri = process.env.MONGODB_URI || "";
const adminEmail = process.env.ADMIN_EMAIL || "daraseyi086@gmail.com";
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
    if (!Array.isArray(existing.roles) || !existing.roles.includes("admin")) {
      existing.roles = Array.from(new Set([...(existing.roles || []), "admin", "learner"]));
      await existing.save();
      console.log("Admin role added to existing user");
    } else {
      console.log("Admin user already exists");
    }
    await mongoose.disconnect();
    return;
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const user = await UserModel.create({
    email: adminEmail.toLowerCase(),
    passwordHash,
    roles: ["admin", "learner"]
  });

  console.log(`Created admin user: ${user.email}`);
  await mongoose.disconnect();
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
