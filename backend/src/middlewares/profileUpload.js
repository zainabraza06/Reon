import { createUploader } from "./upload.js";
export const profileUpload = createUploader({
  allowedTypes: ["image/jpeg", "image/png", "image/jpg", "image/webp"],
  maxSize: 2 * 1024 * 1024, // 2MB
});
