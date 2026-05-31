import { io, Socket } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5001";

type Listener = (data: unknown) => void;

class SocketService {
  private socket: Socket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private userId: string | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  connect(userId: string) {
    if (this.socket?.connected && this.userId === userId) return;
    this.userId = userId;

    this.socket = io(SOCKET_URL, {
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    this.socket.on("connect", () => {
      this.socket!.emit("authenticate", userId);
      this.socket!.emit("join-groups");
      this.startHeartbeat();
    });

    this.socket.on("reconnect_failed", () => {
      this.socket?.connect();
    });

    // Bridge all events to internal listeners
    this.socket.onAny((event: string, data: unknown) => {
      this.listeners.get(event)?.forEach((fn) => fn(data));
    });
  }

  disconnect() {
    this.stopHeartbeat();
    this.socket?.disconnect();
    this.socket = null;
    this.userId = null;
  }

  on(event: string, fn: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
  }

  off(event: string, fn: Listener) {
    this.listeners.get(event)?.delete(fn);
  }

  emit(event: string, data?: unknown) {
    this.socket?.emit(event, data);
  }

  get connected() {
    return this.socket?.connected ?? false;
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.socket?.emit("heartbeat");
    }, 12000);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}

export const socketService = new SocketService();
