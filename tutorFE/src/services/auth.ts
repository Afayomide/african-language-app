import api from "@/lib/api";
import { feTutorRoutes } from "@/lib/apiRoutes";
import { AuthResponse } from "@/types";

export const authService = {
  async signup(input: {
    email: string;
    password: string;
    language: "yoruba" | "igbo" | "hausa";
    displayName?: string;
  }) {
    const response = await api.post(feTutorRoutes.signup(), input);
    return response.data as {
      message: string;
      user: { id: string; email: string; role: "tutor" };
      tutor: {
        id: string;
        language: "yoruba" | "igbo" | "hausa";
        displayName: string;
        isActive: boolean;
      };
    };
  },

  async login(email: string, password: string) {
    const response = await api.post<AuthResponse>(feTutorRoutes.login(), { email, password });
    if (response.data.token) {
      localStorage.setItem("tutorToken", response.data.token);
      localStorage.setItem("tutorUser", JSON.stringify(response.data.user));
      localStorage.setItem("tutorProfile", JSON.stringify(response.data.tutor));
    }
    return response.data;
  },

  logout() {
    localStorage.removeItem("tutorToken");
    localStorage.removeItem("tutorUser");
    localStorage.removeItem("tutorProfile");
    window.location.href = "/login";
  },

  getCurrentUser() {
    const user = localStorage.getItem("tutorUser");
    return user ? JSON.parse(user) : null;
  },

  getTutorProfile() {
    const tutor = localStorage.getItem("tutorProfile");
    return tutor ? JSON.parse(tutor) : null;
  },

  isAuthenticated() {
    return !!localStorage.getItem("tutorToken");
  }
};
