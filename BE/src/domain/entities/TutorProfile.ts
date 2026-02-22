export type TutorProfileEntity = {
  id: string;
  _id?: string;
  userId: string;
  language: "yoruba" | "igbo" | "hausa";
  displayName: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};
