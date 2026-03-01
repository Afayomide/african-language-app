import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "",
});

api.interceptors.request.use((config) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("tutorToken") : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== "undefined") {
        const token = localStorage.getItem("tutorToken");
        const requestUrl = String(error.config?.url || "");
        const isAuthRequest = requestUrl.includes("/api/tutor/auth");

        if (token && !isAuthRequest) {
          localStorage.removeItem("tutorToken");
          localStorage.removeItem("tutorUser");
          localStorage.removeItem("tutorProfile");
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
