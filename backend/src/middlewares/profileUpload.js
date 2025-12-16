import { createUploader } from "./upload.js";
export const profileUpload = createUploader({
  allowedTypes: ["image/jpeg", "image/png", "image/jpg", "image/webp"],
  maxSize: 5 * 1024 * 1024, // 2MB
});
