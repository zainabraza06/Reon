import jwt from "jsonwebtoken";
import User from "../models/User.js";

export async function protectRoute(req, res, next){
  try{
    const token=req.cookies?.token || (req.headers.authorization?.startsWith("Bearer")?req.headers.authorization.split(" ")[1]:null);

    if(!token){
      return res.status(401).json({message: "Not authorized, token missing"});
    }


    const decoded=jwt.verify(token, process.env.JWT_SECRET);
    if(!decoded) {
      return res.status(401).json({message: "Invalid token"});

    }


    const user=await User.findById(decoded.id).select("-password");
    if(!user){
      return res.status(401).json({message: "User not found"});
    }


    req.user=user;
    next();
  }

  catch(error) {
   console.error("ProtecteRoute error: ", error);
   return res.status(401).json({message: "Unauthorized or expired token"});
  }
}