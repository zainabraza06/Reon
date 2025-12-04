// middlewares/upload.js
import multer from "multer";

const storage = multer.memoryStorage();

export const createUploader = ({ allowedTypes, maxSize }) => {
  return multer({
    storage,
    fileFilter: (req, file, cb) => {
      if (!allowedTypes.includes(file.mimetype)) {
        cb(new Error(`File type not allowed: ${file.mimetype}`), false);
      } else {
        cb(null, true);
      }
    },
    limits: { fileSize: maxSize },
  });
};
