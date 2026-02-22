import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import UserModel from "../models/User.js";
import TutorProfileModel from "../models/tutor/TutorProfile.js";

const mongoUri = process.env.MONGODB_URI || "";
const tutorEmail = process.env.TUTOR_EMAIL || "tutor@gmail.com";
const tutorPassword = process.env.TUTOR_PASSWORD || "Vestord33";
const tutorLanguage = process.env.TUTOR_LANGUAGE || "yoruba";
const tutorDisplayName = process.env.TUTOR_DISPLAY_NAME || "";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidLanguage(value: string) {
  return value === "yoruba" || value === "igbo" || value === "hausa";
}

async function seed() {
  if (!mongoUri) {
    throw new Error("Missing MONGODB_URI");
  }
  if (!tutorEmail || !tutorPassword) {
    throw new Error("Missing TUTOR_EMAIL or TUTOR_PASSWORD");
  }
  if (!isValidEmail(tutorEmail)) {
    throw new Error("Invalid TUTOR_EMAIL");
  }
  if (!isValidLanguage(tutorLanguage)) {
    throw new Error("Invalid TUTOR_LANGUAGE. Use yoruba, igbo, or hausa");
  }
  if (tutorPassword.length < 8) {
    throw new Error("TUTOR_PASSWORD must be at least 8 chars");
  }

  await mongoose.connect(mongoUri);

  const normalizedEmail = tutorEmail.toLowerCase();
  let user = await UserModel.findOne({ email: normalizedEmail });

  if (user && user.role !== "tutor") {
    throw new Error(`User exists with non-tutor role: ${user.role}`);
  }

  if (!user) {
    const passwordHash = await bcrypt.hash(tutorPassword, 10);
    user = await UserModel.create({
      email: normalizedEmail,
      passwordHash,
      role: "tutor"
    });
    console.log(`Created tutor user: ${user.email}`);
  } else {
    console.log("Tutor user already exists");
  }

  const existingProfile = await TutorProfileModel.findOne({ userId: user._id });
  if (!existingProfile) {
    await TutorProfileModel.create({
      userId: user._id,
      language: tutorLanguage,
      displayName: tutorDisplayName,
      isActive: true
    });
    console.log(`Created tutor profile with language: ${tutorLanguage}`);
  } else {
    console.log("Tutor profile already exists");
  }

  await mongoose.disconnect();
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
