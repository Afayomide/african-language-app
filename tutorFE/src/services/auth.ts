import api from "@/lib/api";
import { feTutorRoutes } from "@/lib/apiRoutes";
import type { AuthResponse, Language, TutorProfile } from "@/types";

function storeTutorSession(response: AuthResponse) {
  if (response.token) {
    localStorage.setItem("tutorToken", response.token);
    localStorage.setItem("tutorUser", JSON.stringify(response.user));
    localStorage.setItem("tutorProfile", JSON.stringify(response.tutor));
  }
}

export const authService = {
  async signup(input: {
    email: string;
    password: string;
    displayName?: string;
  }) {
    const response = await api.post(feTutorRoutes.signup(), input);
    return response.data as {
      message: string;
      user: { id: string; email: string; role: "tutor" };
      tutor: TutorProfile;
      requiresOnboarding?: boolean;
    };
  },

  async login(email: string, password: string) {
    const response = await api.post<AuthResponse>(feTutorRoutes.login(), { email, password });
    storeTutorSession(response.data);
    return response.data;
  },

  async completeOnboarding(language: Language) {
    const response = await api.put<{ tutor: TutorProfile; requiresOnboarding?: boolean }>(
      feTutorRoutes.completeOnboarding(),
      { language }
    );

    const currentProfile = this.getTutorProfile() || { id: response.data.tutor.id, displayName: response.data.tutor.displayName };
    localStorage.setItem(
      "tutorProfile",
      JSON.stringify({
        ...currentProfile,
        ...response.data.tutor
      })
    );

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

  getTutorProfile(): TutorProfile | null {
    const tutor = localStorage.getItem("tutorProfile");
    return tutor ? JSON.parse(tutor) : null;
  },

  isAuthenticated() {
    return !!localStorage.getItem("tutorToken");
  }
};
