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
import callRoutes from "./routes/call.route.js"; // ✅ NEW: Import call routes

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
app.use("/api/calls", callRoutes); // ✅ NEW: Add call routes

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "Chat App Backend",
    version: "1.0.0"
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint not found"
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err);
  
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal server error";
  
  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Create HTTP server and initialize Socket.IO
const server = http.createServer(app);

// Initialize socket
initSocket(server);

// Start server and connect to database
const PORT = process.env.PORT || 5001;
server.listen(PORT, async () => {
  console.log(`✅ Server is running on port ${PORT}`);
  console.log(`📞 Call endpoints available at: http://localhost:${PORT}/api/calls`);
  
  // Check for required environment variables
  const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET'];
  const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingEnvVars.length > 0) {
    console.warn(`⚠️  Missing environment variables: ${missingEnvVars.join(', ')}`);
  }
  
  // Check LiveKit configuration
  if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
    console.warn("⚠️  LiveKit API keys not configured. Voice/Video calls will not work.");
    console.log("   To enable calls, add to .env:");
    console.log("   LIVEKIT_API_KEY=your_key");
    console.log("   LIVEKIT_API_SECRET=your_secret");
    console.log("   LIVEKIT_HOST=wss://your-project.livekit.cloud");
  } else {
    console.log("✅ LiveKit configured for voice/video calls");
  }
  
  try {
    await connectDB();
    console.log("✅ Database connected successfully");
  } catch (err) {
    console.error("❌ Database connection failed:", err);
    process.exit(1); // Exit if database connection fails
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;