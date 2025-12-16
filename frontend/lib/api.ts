// lib/api.ts
import axios, { AxiosInstance } from "axios";

export const api: AxiosInstance = axios.create({
  baseURL: `${process.env.NEXT_PUBLIC_API_URL}`, // your backend URL
  withCredentials: true,
  timeout:120000,
});