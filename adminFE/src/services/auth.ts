import api from "@/lib/api";
import { feAdminRoutes } from "@/lib/apiRoutes";
import { AuthResponse } from "@/types";

export const authService = {
  async login(email: string, password: string) {
    const response = await api.post<AuthResponse>(feAdminRoutes.login(), { email, password });
    if (response.data.token) {
      localStorage.setItem("adminToken", response.data.token);
      localStorage.setItem("adminUser", JSON.stringify(response.data.user));
    }
    return response.data;
  },

  logout() {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUser");
    window.location.href = "/login";
  },

  getCurrentUser() {
    const user = localStorage.getItem("adminUser");
    return user ? JSON.parse(user) : null;
  },

  isAuthenticated() {
    return !!localStorage.getItem("adminToken");
  },
};
