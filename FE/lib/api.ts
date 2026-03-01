import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "",
});

api.interceptors.request.use((config) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("learnerToken") : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      const token = localStorage.getItem("learnerToken");
      const requestUrl = String(error.config?.url || "");
      const isAuthRequest = requestUrl.includes("/api/learner/auth");

      if (token && !isAuthRequest) {
        localStorage.removeItem("learnerToken");
        localStorage.removeItem("learnerUser");
        window.location.href = "/auth/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
