import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "",
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const backendError =
      typeof error?.response?.data?.error === "string"
        ? error.response.data.error
        : typeof error?.response?.data?.message === "string"
          ? error.response.data.message
          : "";
    if (backendError) {
      error.message = backendError;
    }

    if (error.response?.status === 401 && typeof window !== "undefined") {
      const requestUrl = String(error.config?.url || "");
      const isAuthRequest = requestUrl.includes("/api/learner/auth");

      if (!isAuthRequest) {
        fetch("/api/learner/auth/logout", { method: "POST" }).finally(() => {
          window.location.href = "/auth/login";
        });
      }
    }
    return Promise.reject(error);
  }
);

export default api;
