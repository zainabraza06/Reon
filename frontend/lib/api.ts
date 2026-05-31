const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || "Request failed");
  }
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const api = {
  auth: {
    signup: (data: { fullName: string; email: string; password: string }) =>
      request("/auth/signup", { method: "POST", body: JSON.stringify(data) }),
    login: (data: { email: string; password: string }) =>
      request("/auth/login", { method: "POST", body: JSON.stringify(data) }),
    logout: () => request("/auth/logout", { method: "POST" }),
    me: () => request<{ user: import("@/types").User }>("/auth/me"),
    onboard: (data: FormData) =>
      fetch(`${BASE_URL}/auth/onboard`, { method: "POST", credentials: "include", body: data }).then(
        (r) => (r.ok ? r.json() : r.json().then((e) => Promise.reject(new Error(e.message))))
      ),
  },

  // ── Keys ───────────────────────────────────────────────────────────────────
  keys: {
    upload: (publicKey: JsonWebKey) =>
      request("/keys/uploadPublicKey", { method: "POST", body: JSON.stringify({ publicKey }) }),
    get: (userId: string) =>
      request<{ publicKey: JsonWebKey }>(`/keys/publicKey/${userId}`),
  },

  // ── Messages (1:1) ─────────────────────────────────────────────────────────
  messages: {
    // Returns { success, data: messageObject }
    send: async (formData: FormData): Promise<import("@/types").Message> => {
      const r = await fetch(`${BASE_URL}/messages/send`, { method: "POST", credentials: "include", body: formData });
      const json = await r.json();
      if (!r.ok) throw new Error(json.message || "Send failed");
      // backend wraps in { success, data } or { success, message, data }
      return (json.data ?? json.message ?? json) as import("@/types").Message;
    },
    // Returns { success, data: Message[] }
    get: async (userId: string, params?: { limit?: number; before?: string }): Promise<{ messages: import("@/types").Message[] }> => {
      const q = new URLSearchParams();
      if (params?.limit) q.set("limit", String(params.limit));
      if (params?.before) q.set("before", params.before);
      const json = await request<{ success: boolean; data?: import("@/types").Message[]; messages?: import("@/types").Message[] }>(`/messages/${userId}?${q}`);
      return { messages: json.data ?? json.messages ?? [] };
    },
    sidebar: () => request<{ chats: import("@/types").ChatListItem[] }>("/messages/sidebar/list"),
    search: (q: string) => request<{ users: import("@/types").ChatListItem[] }>(`/messages/search?q=${encodeURIComponent(q)}`),
    markRead: (userId: string) => request(`/messages/chat/read/${userId}`, { method: "PUT" }),
  },

  // ── Groups ─────────────────────────────────────────────────────────────────
  groups: {
    create: (data: { name: string; description?: string; memberIds: string[] }) =>
      request<{ group: import("@/types").GroupChat }>("/groups", { method: "POST", body: JSON.stringify(data) }),
    list: () => request<{ groups: import("@/types").GroupChat[] }>("/groups"),
    get: (id: string) => request<{ group: import("@/types").GroupChat }>(`/groups/${id}`),
    update: (id: string, data: { name?: string; description?: string }) =>
      request<{ group: import("@/types").GroupChat }>(`/groups/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => request(`/groups/${id}`, { method: "DELETE" }),
    addMembers: (id: string, memberIds: string[]) =>
      request(`/groups/${id}/members`, { method: "POST", body: JSON.stringify({ memberIds }) }),
    removeMember: (id: string, memberId: string) =>
      request(`/groups/${id}/members/${memberId}`, { method: "DELETE" }),
    promoteAdmin: (id: string, memberId: string) =>
      request(`/groups/${id}/admins/${memberId}`, { method: "PATCH" }),
    sendMessage: (id: string, formData: FormData) =>
      fetch(`${BASE_URL}/groups/${id}/messages`, { method: "POST", credentials: "include", body: formData }).then(
        (r) => (r.ok ? r.json() : r.json().then((e) => Promise.reject(new Error(e.message))))
      ),
    getMessages: (id: string, params?: { limit?: number; before?: string }) => {
      const q = new URLSearchParams();
      if (params?.limit) q.set("limit", String(params.limit));
      if (params?.before) q.set("before", params.before);
      return request<{ messages: import("@/types").GroupMessage[]; hasMore: boolean }>(`/groups/${id}/messages?${q}`);
    },
    markRead: (id: string) => request(`/groups/${id}/read`, { method: "PUT" }),
  },

  // ── Friends ────────────────────────────────────────────────────────────────
  friends: {
    list: () => request<{ friends: import("@/types").User[] }>("/users/friends"),
    recommendations: () => request<{ users: import("@/types").User[] }>("/users/recommendation"),
    send: (id: string) => request(`/users/friend-request/${id}`, { method: "POST" }),
    accept: (id: string) => request(`/users/friend-request/${id}/accept`, { method: "POST" }),
    reject: (id: string) => request(`/users/friend-request/${id}`, { method: "DELETE" }),
    withdraw: (id: string) => request(`/users/friend-request/${id}/withdraw`, { method: "POST" }),
    remove: (id: string) => request(`/users/friends/${id}`, { method: "PATCH" }),
    received: () => request<{ requests: import("@/types").FriendRequest[] }>("/users/friend-requests/received"),
    sent: () => request<{ requests: import("@/types").FriendRequest[] }>("/users/friend-requests/sent"),
    pendingCount: () => request<{ count: number }>("/users/friend-request/pending-count"),
  },

  // ── Calls ──────────────────────────────────────────────────────────────────
  calls: {
    create: (toUserId: string, type: "audio" | "video") =>
      request<{ callId: string; type: string; iceServers: RTCIceServer[]; status: string; calleeStatus: string }>(
        "/calls", { method: "POST", body: JSON.stringify({ toUserId, type }) }
      ),
    get: (callId: string) =>
      request<{ callId: string; type: string; status: string; iceServers: RTCIceServer[] }>(`/calls/${callId}`),
    turn: (callId: string) => request<{ iceServers: RTCIceServer[] }>(`/calls/${callId}/turn`),
  },

  // ── Settings ───────────────────────────────────────────────────────────────
  settings: {
    updateProfile: (data: FormData) =>
      fetch(`${BASE_URL}/settings/profile`, { method: "PUT", credentials: "include", body: data }).then(
        (r) => (r.ok ? r.json() : r.json().then((e) => Promise.reject(new Error(e.message))))
      ),
    changePassword: (data: { currentPassword: string; newPassword: string }) =>
      request("/settings/change-password", { method: "PUT", body: JSON.stringify(data) }),
  },
};
