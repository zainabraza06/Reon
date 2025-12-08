// lib/api.ts
import axios, { AxiosInstance } from "axios";

export const api: AxiosInstance = axios.create({
  baseURL: "http://localhost:5001/api", // your backend URL
  withCredentials: true,
  timeout:30000,
});
