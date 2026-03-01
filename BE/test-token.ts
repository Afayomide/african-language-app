import "dotenv/config";
import jwt from "jsonwebtoken";

const TOKEN_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || "7d");
console.log("JWT_EXPIRES_IN:", process.env.JWT_EXPIRES_IN);
console.log("TOKEN_EXPIRES_IN (defaulted):", TOKEN_EXPIRES_IN);

const secret = process.env.JWT_SECRET;
console.log("JWT_SECRET is set:", !!secret);
if (!secret) {
  console.log("WARNING: JWT_SECRET is not set in .env");
}
const token = jwt.sign({ test: true }, secret || "temp-secret", { expiresIn: TOKEN_EXPIRES_IN as any });
const decoded = jwt.decode(token) as any;

if (decoded && decoded.exp) {
  const expiresAt = new Date(decoded.exp * 1000);
  const now = new Date();
  const diffDays = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  console.log("Token expires at:", expiresAt.toISOString());
  console.log("Expires in (days):", diffDays.toFixed(2));
} else {
  console.log("Failed to decode token or missing exp claim");
}
