import api from "@/lib/api";
import { feVoiceRoutes } from "@/lib/apiRoutes";
import { AuthResponse } from "@/types";

export const authService = {
  async signup(input: {
    email: string;
    password: string;
    language: "yoruba" | "igbo" | "hausa";
    displayName?: string;
  }) {
    const response = await api.post(feVoiceRoutes.signup(), input);
    return response.data as {
      message: string;
      user: { id: string; email: string; role: "voice_artist" };
      voiceArtist: {
        id: string;
        language: "yoruba" | "igbo" | "hausa";
        displayName: string;
        isActive: boolean;
      };
    };
  },

  async login(email: string, password: string) {
    const response = await api.post<AuthResponse>(feVoiceRoutes.login(), { email, password });
    if (response.data.token) {
      localStorage.setItem("voiceArtistToken", response.data.token);
      localStorage.setItem("voiceArtistUser", JSON.stringify(response.data.user));
      localStorage.setItem("voiceArtistProfile", JSON.stringify(response.data.voiceArtist));
    }
    return response.data;
  },

  logout() {
    localStorage.removeItem("voiceArtistToken");
    localStorage.removeItem("voiceArtistUser");
    localStorage.removeItem("voiceArtistProfile");
    window.location.href = "/login";
  },

  getCurrentUser() {
    const user = localStorage.getItem("voiceArtistUser");
    return user ? JSON.parse(user) : null;
  },

  getProfile() {
    const profile = localStorage.getItem("voiceArtistProfile");
    return profile ? JSON.parse(profile) : null;
  },

  getTutorProfile() {
    return this.getProfile();
  },

  isAuthenticated() {
    return !!localStorage.getItem("voiceArtistToken");
  }
};
