import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  timeout: 10_000,
  headers: { "Content-Type": "application/json" },
});

export default api;
