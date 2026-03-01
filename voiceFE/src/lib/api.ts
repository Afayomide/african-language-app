import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || ""
});

api.interceptors.request.use((config) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("voiceArtistToken") : null;
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
        const token = localStorage.getItem("voiceArtistToken");
        const requestUrl = String(error.config?.url || "");
        const isAuthRequest = requestUrl.includes("/api/voice/auth");

        if (token && !isAuthRequest) {
          localStorage.removeItem("voiceArtistToken");
          localStorage.removeItem("voiceArtistUser");
          localStorage.removeItem("voiceArtistProfile");
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
