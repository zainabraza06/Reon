/**
 * Pure Express app factory — no server.listen(), no sockets.
 * Import this in tests so the app can be exercised via supertest
 * without binding to a port or touching Socket.IO.
 */
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import passport from "passport";
import cors from "cors";

import authRoutes    from "./routes/auth.route.js";
import settingRoutes from "./routes/settings.route.js";
import friendRoutes  from "./routes/friend.route.js";
import messageRoutes from "./routes/message.route.js";
import keyRoutes     from "./routes/key.route.js";
import callRoutes    from "./routes/call.route.js";
import groupChatRoutes    from "./routes/groupChat.route.js";
import notificationRoutes from "./routes/notification.route.js";

import "./utils/passport.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);

  const rawOrigins = (process.env.FRONTEND_URL || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  const allowedOrigins = [...rawOrigins, "http://localhost:3000", "http://localhost:3001"];

  const corsOptions = {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) callback(null, true);
      else callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    exposedHeaders: ["Content-Disposition", "X-Encrypted", "X-Encryption-IV", "X-File-Name"],
    allowedHeaders: ["Content-Type", "Authorization"],
  };

  app.options("*", cors(corsOptions));
  app.use(cors(corsOptions));
  app.use(helmet());
  app.use(express.json());
  app.use(cookieParser());
  app.use(passport.initialize());

  app.use("/api/auth",     authRoutes);
  app.use("/api/settings", settingRoutes);
  app.use("/api/users",    friendRoutes);
  app.use("/api/messages", messageRoutes);
  app.use("/api/keys",     keyRoutes);
  app.use("/api/calls",    callRoutes);
  app.use("/api/groups",        groupChatRoutes);
  app.use("/api/notifications", notificationRoutes);

  return app;
}
