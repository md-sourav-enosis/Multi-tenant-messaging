import axios from "axios";
import { APP_CONSTANTS } from "../../constants/app-constants";
import { MESSAGES } from "../../constants/messages";

const baseURL = import.meta.env.VITE_API_URL;

if (!baseURL) {
  throw new Error(MESSAGES.BASE_URL_NOT_FOUND);
}

const api = axios.create({
  baseURL,
  timeout: APP_CONSTANTS.API_CALL_TIMEOUT,
  headers: {
    "Content-Type": "application/json",
  },
});

// Automatically attach Cognito JWT access token to every outgoing request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("accessToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default api;