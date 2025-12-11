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



import { connectDB } from "./lib/db.js";
import { initSocket } from "./lib/socket.js";


import "./utils/passport.js";

dotenv.config();

const app = express();

const corsOptions = {
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  exposedHeaders: ['Content-Disposition', 'X-Encrypted'],
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

// Create HTTP server and initialize Socket.IO
const server = http.createServer(app);


// Initialize socket
initSocket(server);



// Start server and connect to database
const PORT = process.env.PORT || 5001;
server.listen(PORT, async () => {
  console.log(`✅ Server is running on port ${PORT}`);
  try {
    await connectDB();
    console.log("✅ Database connected successfully");
  } catch (err) {
    console.error("❌ Database connection failed:", err);
  }
});
