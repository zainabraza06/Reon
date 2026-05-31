
import express from "express";
import dotenv from "dotenv";
import http from "http";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import passport from "passport";
import cors from "cors";

import authRoutes from "./routes/auth.route.js";
import settingRoutes from "./routes/settings.route.js";
import friendRoutes from "./routes/friend.route.js";
import messageRoutes from "./routes/message.route.js";
import keyRoutes from "./routes/key.route.js";
import callRoutes from "./routes/call.route.js";
import groupChatRoutes from "./routes/groupChat.route.js";



import { connectDB } from "./lib/db.js";
import { initSocket } from "./lib/socket.js";
import { initCallNamespace } from "./lib/callSocket.js";
import { getIO } from "./lib/socket.js";


import "./utils/passport.js";

dotenv.config();

const app = express();
app.set('trust proxy', 1);

const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  exposedHeaders: ['Content-Disposition', 'X-Encrypted', 'X-Encryption-IV', 'X-File-Name'],
  allowedHeaders: ['Content-Type', 'Authorization']
};




app.use(cors(corsOptions));
// Security & parsing middleware
app.use(helmet());
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/settings", settingRoutes);
app.use("/api/users", friendRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/keys", keyRoutes);
app.use("/api/calls", callRoutes);
app.use("/api/groups", groupChatRoutes);

// Create HTTP server and initialize Socket.IO
const server = http.createServer(app);


// Initialize socket
initSocket(server);
initCallNamespace(getIO());



// Start server and connect to database
const PORT = process.env.PORT || 5001;
server.listen(PORT, async () => {
  console.log(` Server is running on port ${PORT}`);
  try {
    await connectDB();
    console.log("Database connected successfully");
  } catch (err) {
    console.error("Database connection failed:", err);
  }
});
