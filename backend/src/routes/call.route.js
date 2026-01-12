import express from "express";
import { protectRoute } from "../middlewares/auth.middleware.js";
import {
  createCallSession,
  getCallSession,
  getTurnCredentialsForCall,
  testIceServersEndpoint
} from "../controllers/call.controller.js";


const router = express.Router();

router.use(protectRoute);

// Call management routes
router.post("/",  createCallSession);
router.get("/:callId",getCallSession);
router.get("/:callId/turn",  getTurnCredentialsForCall);
router.get("/test/ice-servers",  testIceServersEndpoint);




export default router;

