import { body, validationResult } from "express-validator";

import { validateRequest } from "./validateRequest.js";
import User from "../models/User.js";


// Validation rules
export const validateSignup = [
  body("fullName")
    .notEmpty().withMessage("Full name is required."),
  body("email")
    .isEmail().withMessage("Please provide a valid email."),

  body("password")
    .isLength({ min: 8, max: 14 }).withMessage("Password must be 8-14 characters long.")
    .matches(/[A-Z]/).withMessage("Password must contain at least one uppercase letter.")
    .matches(/[a-z]/).withMessage("Password must contain at least one lowercase letter.")
    .matches(/\d/).withMessage("Password must contain at least one number.")
    .matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/).withMessage("Password must contain at least one special character (!@#$%^&*()_+-=[]{};\':\"\\|,.<>/?)"),

  // Handle errors
  validateRequest,
];

export const validateLogin = [
  body("email").isEmail().withMessage("Please provide a valid email."),
  body("password").notEmpty().withMessage("Password is required."),
  validateRequest,
];



export const onboardValidator = [
  // nativeLanguage (mandatory)
  body("nativeLanguage")
    .trim()
    .notEmpty().withMessage("Native language is required")
    .isString()
    .isLength({ min: 2, max: 50 }).withMessage("Native language must be between 2 and 50 characters"),

  // location (mandatory)
  body("location")
    .trim()
    .notEmpty().withMessage("Location is mandatory")
    .isString()
    .isLength({ min: 2, max: 50 }).withMessage("Location must be between 2 and 50 characters"),

  // bio (mandatory)
  body("bio")
    .trim()
    .notEmpty().withMessage("Bio is mandatory")
    .isString()
    .isLength({ min: 2, max: 300 }).withMessage("Bio can't exceed 300 characters"),

  // username (mandatory + unique)
  body("username")
    .trim()
    .notEmpty().withMessage("Username is mandatory")
    .isString()
    .isLength({ min: 6, max: 20 }).withMessage("Username must be 6 to 10 characters long")
    .custom(async (value) => {
      const existingUser = await User.findOne({ username: value });
      if (existingUser) {
        throw new Error("Username already in use");
      }
      return true;
    }),

  // Handle errors
  validateRequest,
];

;

export const updateProfileValidator = [
  // fullName (optional, can be same)
  body("fullName")
    .optional()
    .trim()
    .notEmpty().withMessage("Full name cannot be empty.")
    .isLength({ min: 2, max: 50 }).withMessage("Full name must be between 2 and 50 characters"),

  // bio (optional)
  body("bio")
    .optional()
    .trim()
    .isLength({ max: 300 }).withMessage("Bio cannot exceed 300 characters"),

  // location (optional)
  body("location")
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage("Location must be 2 to 50 characters long"),

  // username (optional but must not be empty and must be unique)
  body("username")
    .optional()
    .trim()
    .notEmpty().withMessage("Username can't be empty")
    .isLength({ min: 3, max: 30 }).withMessage("Username must be 3 to 30 characters long")
    .custom(async (value, { req }) => {
      const existingUser = await User.findOne({ username: value, _id: { $ne: req.user._id } });
      if (existingUser) throw new Error("Username already in use");
      return true;
    }),

  // Handle validation errors
  validateRequest,
];



export const validateForgotPassword = [
  body("email")
    .isEmail()
    .withMessage("Please provide a valid email")
    .custom(async (value) => {
      const user = await User.findOne({ email: value });
      if (!user) throw new Error("User not found with this email");
      return true;
    }),
  validateRequest,
];


export const validateResetPassword = [
  body("token")
    .notEmpty()
    .withMessage("Reset token is required"),
  
  body("password")
    .isLength({ min: 8, max: 14 }).withMessage("Password must be 8-14 characters long.")
    .matches(/[A-Z]/).withMessage("Password must contain at least one uppercase letter.")
    .matches(/[a-z]/).withMessage("Password must contain at least one lowercase letter.")
    .matches(/\d/).withMessage("Password must contain at least one number.")
    .matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/).withMessage("Password must contain at least one special character (!@#$%^&*()_+-=[]{};\':\"\\|,.<>/?)"),
  
  validateRequest,
];


export const changePasswordValidator = [
  body("currentPassword")
    .optional(),
  
  body("newPassword")
    .isLength({ min: 8, max: 14 }).withMessage("Password must be 8-14 characters long.")
    .matches(/[A-Z]/).withMessage("Password must contain at least one uppercase letter.")
    .matches(/[a-z]/).withMessage("Password must contain at least one lowercase letter.")
    .matches(/\d/).withMessage("Password must contain at least one number.")
    .matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/).withMessage("Password must contain at least one special character (!@#$%^&*()_+-=[]{};\':\"\\|,.<>/?)"),
  
  validateRequest
];



