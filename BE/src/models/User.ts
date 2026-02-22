import mongoose, { Schema, type InferSchemaType } from "mongoose";

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["admin", "learner", "tutor"], default: "admin" }
  },
  { timestamps: true }
);

UserSchema.index({ role: 1, createdAt: -1 });

export type UserDocument = InferSchemaType<typeof UserSchema> & {
  _id: mongoose.Types.ObjectId;
};

const UserModel = mongoose.model("User", UserSchema);

export default UserModel;
