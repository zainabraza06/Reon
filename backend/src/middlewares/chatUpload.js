import { createUploader } from "./upload.js";

const chatUpload = createUploader({
  allowedTypes: [
    "image/jpeg", "image/png", "image/jpg",

    // Voice recording formats
    "audio/webm",   // Chrome (MOST IMPORTANT)
    "audio/ogg",    // Firefox
    "audio/mp4",    // Safari
    "audio/mpeg",   // Safari
    "audio/mp3",    // Some browsers export mp3

    // Video
    "video/mp4",

    // Documents
    "application/pdf"
  ],

  maxSize: 10 * 1024 * 1024 // 10MB
});

export default chatUpload;
