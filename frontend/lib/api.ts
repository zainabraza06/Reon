// lib/api.ts
import axios, { AxiosInstance } from "axios";

export const api: AxiosInstance = axios.create({
  baseURL: "https://reon-4g0b.onrender.com/api", // your backend URL
  withCredentials: true,
  timeout:30000,
});
