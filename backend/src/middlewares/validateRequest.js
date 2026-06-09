import { validationResult } from "express-validator";

export function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const list = errors.array();
    return res.status(400).json({ message: list[0].msg, errors: list });
  }
  next();
}
