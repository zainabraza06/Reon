import dotenv from "dotenv";
import http from "http";

import { createApp } from "./app.js";
import { connectDB } from "./lib/db.js";
import { initSocket } from "./lib/socket.js";
import { getIO } from "./lib/socket.js";

dotenv.config();

const app    = createApp();
const server = http.createServer(app);

initSocket(server);

const PORT = process.env.PORT || 5001;
server.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);
  try {
    await connectDB();
    console.log("Database connected successfully");
  } catch (err) {
    console.error("Database connection failed:", err);
  }
});
