# Reon — End-to-End Encrypted Messenger

> A privacy-first, real-time messaging platform.  
> Every message is encrypted on your device — the server **never** sees plaintext.

| App | Stack | Purpose |
|-----|-------|---------|
| **Web** | Next.js 16, React 19, TypeScript, Tailwind CSS 4 | Full-featured web client |
| **Mobile** | Flutter 3.x, Provider, Dio | Android (and iOS) client |
| **Backend** | Node.js, Express, MongoDB, Socket.io | REST API + real-time relay |

---

## Table of Contents

1. [Features](#features)
2. [System Architecture](#system-architecture)
3. [Repository Structure](#repository-structure)
4. [Tech Stack](#tech-stack)
5. [Data Models](#data-models)
6. [Authentication Flow](#authentication-flow)
7. [End-to-End Encryption](#end-to-end-encryption)
8. [Device Linking Flow](#device-linking-flow)
9. [Messaging Flows](#messaging-flows)
10. [Mobile Screens — Full Walkthrough](#mobile-screens--full-walkthrough)
11. [Web Routes](#web-routes)
12. [REST API Reference](#rest-api-reference)
13. [Socket.io Events](#socketio-events)
14. [Environment Variables](#environment-variables)
15. [Flutter Setup & Build APK](#flutter-setup--build-apk)
16. [Backend & Web Setup](#backend--web-setup)
17. [Deployment Notes](#deployment-notes)
18. [Troubleshooting](#troubleshooting)

---

## Features

### Communication
- **1:1 direct messages** — text, images, video, audio, documents, voice notes
- **Group chats** — create groups, add/remove members, admin promotion, encrypted group messages
- **Real-time delivery** — Socket.io for instant push, typing indicators, read receipts, online presence
- **Message info** — delivery and read timestamps per message

### Security & Privacy
- **RSA-2048 + AES-256-GCM** hybrid encryption — server is a blind relay
- **Per-user RSA key pairs** — generated client-side; private key stays in secure local storage
- **Device linking** — transfer private keys via ECDH P-256 + QR code (server never sees the private key)
- **Privacy settings** — toggle last-seen and online-status visibility

### Social
- **Friend requests** — send, accept, reject, withdraw
- **Friend management** — list, remove, message directly
- **Discover** — user recommendations with search
- **Notifications** — persisted notification centre with real-time badge updates

### Media & Storage
- **Encrypted file storage** — media blobs in MongoDB GridFS (`encryptedFiles` bucket)
- **Profile pictures** — Cloudinary CDN
- **Voice notes** — record and send encrypted audio messages

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Clients                          │
│                                                         │
│   ┌─────────────────┐        ┌──────────────────────┐  │
│   │  Flutter Mobile │        │   Next.js Web App    │  │
│   │  (Android/iOS)  │        │ (React 19, Tailwind)  │  │
│   └────────┬────────┘        └──────────┬───────────┘  │
└────────────┼─────────────────────────────┼─────────────┘
             │  HTTPS + cookies (Dio)       │  HTTPS + cookies
             │  WebSocket (socket_io)       │  WebSocket (socket.io)
             ▼                             ▼
┌─────────────────────────────────────────────────────────┐
│                   Backend (Node.js)                     │
│                                                         │
│   ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│   │  Express API │  │  Socket.io   │  │  Passport   │  │
│   │   /api/*     │  │   Server     │  │  JWT auth   │  │
│   └──────┬───────┘  └──────┬───────┘  └─────────────┘  │
└──────────┼────────────────┼─────────────────────────────┘
           │                │
           ▼                ▼
┌────────────────────┐  ┌────────────────────┐
│     MongoDB        │  │    Cloudinary      │
│  Users, Messages,  │  │  Profile pictures  │
│  Groups, Keys,     │  └────────────────────┘
│  Notifs, GridFS    │
└────────────────────┘
```

### Request lifecycle (message send)

```
Client                    Express API             MongoDB          Socket.io
  │                            │                      │                │
  │── encryptText() locally ──▶│                      │                │
  │── POST /api/messages/send ▶│── save ciphertext ──▶│                │
  │                            │◀── saved ────────────│                │
  │                            │─── emit new-message ────────────────▶ receiver
  │◀── message-sent ──────────────────────────────────────────────────│
  │                            │                      │                │
```

---

## Repository Structure

```
Reon/
├── backend/                    # Node.js API + Socket.io
│   └── src/
│       ├── app.js              # Express factory (routes, CORS, middleware)
│       ├── server.js           # HTTP server + DB + socket init
│       ├── controllers/        # Business logic per domain
│       ├── models/             # Mongoose schemas
│       ├── routes/             # Express route definitions
│       ├── middlewares/        # Auth, upload, validation
│       ├── lib/                # db.js, socket.js, cloudinary.js
│       └── utils/              # passport.js, generateToken.js
│
├── frontend/                   # Next.js 16 web app
│   ├── app/
│   │   ├── (auth)/             # Login, signup, onboarding
│   │   ├── (main)/             # Authenticated app shell
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── chat/               # Sidebar, bubbles, input, group modal
│   │   ├── layout/             # MobileNav
│   │   └── ui/                 # Avatar, NotificationBell
│   ├── context/                # AuthContext, NotificationContext, SocketContext
│   ├── hooks/                  # useMessages, useGroupMessages
│   ├── lib/                    # api.ts, crypto.ts, socket.ts
│   └── types/                  # Shared TypeScript interfaces
│
├── flutter_app/                # Flutter mobile app
│   └── lib/
│       ├── main.dart           # Entry point + auth gate
│       ├── config.dart         # API_BASE, SOCKET_URL, SITE_URL
│       ├── screens/            # All 13 screens
│       ├── services/           # api_service, socket_service, crypto_service
│       ├── providers/          # auth_provider (ChangeNotifier)
│       ├── models/             # Dart data classes
│       ├── widgets/            # Reusable components
│       └── theme/              # Colors, gradients, light/dark themes
│
└── README.md
```

---

## Tech Stack

### Mobile (`flutter_app/`)
| Layer | Technology |
|-------|-----------|
| Framework | Flutter 3.x (Dart ≥ 3.2) |
| State | Provider (ChangeNotifier) |
| HTTP | Dio + cookie_jar + dio_cookie_manager |
| Real-time | socket_io_client |
| Crypto | pointycastle (RSA-OAEP + AES-GCM + ECDH P-256) |
| Secure storage | flutter_secure_storage (Android Keystore) |
| QR | qr_flutter (generate), mobile_scanner (scan) |
| Images | cached_network_image, image_picker |
| Fonts | google_fonts (Inter) |

### Web (`frontend/`)
| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| Real-time | socket.io-client 4.x |
| Crypto | Web Crypto API (RSA-OAEP-256, AES-GCM, ECDH P-256) |
| State | React Context API |

### Backend (`backend/`)
| Layer | Technology |
|-------|-----------|
| Runtime | Node.js (ES modules) |
| HTTP | Express 4 |
| Database | MongoDB + Mongoose 8 |
| File storage | GridFS (encrypted media blobs) |
| Images | Cloudinary |
| Auth | Passport.js, JWT (httpOnly cookies), bcryptjs |
| Real-time | Socket.io 4 |
| Security | Helmet, express-rate-limit, CORS |

---

## Data Models

### MongoDB collections

| Collection | Description |
|-----------|-------------|
| `users` | Accounts, profiles, privacy settings, friend list |
| `messages` | 1:1 encrypted messages + media metadata |
| `groupchats` | Groups, members, admins, embedded messages |
| `publickeys` | RSA public keys (JWK) per user |
| `friendrequests` | Pending / accepted / rejected / withdrawn |
| `notifications` | In-app notification records |
| `encryptedFiles` (GridFS) | Encrypted media blobs |

### Key message fields

| Field | Type | Description |
|-------|------|-------------|
| `ciphertext` | string | AES-GCM encrypted content (base64) |
| `encryptedKey` | string | AES key wrapped with receiver's RSA public key |
| `senderEncryptedKey` | string | AES key wrapped with sender's RSA public key |
| `contentType` | string | `text \| image \| audio \| video \| document` |
| `delivered` | bool | Delivery acknowledgement |
| `read` | bool | Read receipt |
| `isVoiceMessage` | bool | Whether the audio is a voice note |

---

## Authentication Flow

```
App Start
    │
    ▼
Auth status?
    ├── unknown ────────────────▶  Loading spinner
    ├── unauthenticated ─────────▶  LoginScreen
    └── authenticated
            │
            ▼
        isOnboarded?
            ├── No ──────────────▶  OnboardingScreen
            └── Yes ─────────────▶  HomeScreen
```

### Auth methods
- **Email + password** — `POST /api/auth/signup`, `POST /api/auth/login`
- **Google OAuth** — `GET /api/auth/google` → callback sets JWT cookie
- **Session** — JWT in httpOnly cookie; `protectRoute` middleware validates on every protected request
- **Socket auth** — client emits `authenticate` with `userId` after login

### Auth API routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/signup` | — | Register |
| POST | `/api/auth/login` | — | Login (rate-limited) |
| POST | `/api/auth/logout` | — | Clear session |
| GET | `/api/auth/me` | ✓ | Current user |
| POST | `/api/auth/onboard` | ✓ | Complete profile setup |
| GET | `/api/auth/verify-email` | — | Email verification |
| POST | `/api/auth/forgot-password` | — | Send reset email |
| POST | `/api/auth/forgot-password/reset` | — | Reset password |
| GET | `/api/auth/google` | — | Start Google OAuth |
| GET | `/api/auth/google/callback` | — | OAuth callback |
| GET | `/api/auth/details/:userId` | — | Public user details |

---

## End-to-End Encryption

The server is a **blind relay** — it stores and forwards ciphertext only.

### Text messages (1:1)
```
Sender device                    Server                  Receiver device
     │                              │                           │
     │  1. Generate AES-256 key     │                           │
     │  2. Encrypt plaintext        │                           │
     │     with AES-GCM             │                           │
     │  3. Wrap AES key with        │                           │
     │     receiver RSA public key  │                           │
     │  4. Wrap AES key with        │                           │
     │     sender RSA public key    │                           │
     │── POST ciphertext + keys ──▶ │── push to receiver ────▶ │
     │                              │                           │
     │                              │     5. Unwrap AES key     │
     │                              │        with own RSA priv  │
     │                              │     6. Decrypt ciphertext │
```

### File / media messages
1. Encrypt file bytes with AES-GCM (unique key per file)
2. RSA-encrypt AES key for sender and receiver
3. Upload encrypted blob to GridFS; store metadata + keys in message document

### Group messages
- One AES key per message, RSA-encrypted separately for **each group member**
- Each member decrypts their own copy with their own RSA private key

### Key storage

| Platform | Private key | Public key |
|----------|------------|-----------|
| Web | IndexedDB (`reon-crypto` store) | IndexedDB + server |
| Mobile | flutter_secure_storage (Android Keystore) | Secure storage + server |

### Crypto algorithms

| Purpose | Algorithm |
|---------|-----------|
| Key wrapping | RSA-2048 OAEP-SHA256 |
| Content encryption | AES-256-GCM |
| Device linking | ECDH P-256 + AES-GCM |

---

## Device Linking Flow

Transfer an existing RSA private key to a new device without the server ever seeing it.

```
Device A (has keys)           Server              Device B (new device)
        │                        │                         │
        │── POST create session ▶│                         │
        │   (ECDH pub key A)     │                         │
        │◀── sessionId ──────────│                         │
        │                        │                         │
        │  Shows QR code         │                         │
        │  (sessionId + ECDH     │                         │
        │   pub key A)           │                         │
        │                        │◀── scan QR ─────────────│
        │                        │◀── claim (ECDH pub B) ──│
        │◀── device-link-claimed (socket) ─────────────────│
        │                        │                         │
        │  ECDH derive shared    │                         │
        │  AES key               │                         │
        │  Encrypt RSA priv JWK  │                         │
        │── PUT transfer ───────▶│                         │
        │   (encrypted key)      │──device-link-ready ────▶│
        │                        │                         │
        │                        │◀── GET session ─────────│
        │                        │    (fetch encrypted key)│
        │                        │                         │
        │                        │  ECDH derive same AES   │
        │                        │  Decrypt RSA private key│
        │                        │  Import + store locally │
```

Screens involved:
- **Mobile — Device A**: `SettingsLinkDeviceScreen` (generates QR)
- **Mobile — Device B**: `LinkDeviceScreen` (scans QR, route `/link-device`)

---

## Messaging Flows

### 1:1 message with delivery + read receipts

```
Sender ──▶ API (save) ──▶ Receiver (new-message socket event)
                               │
                               │── confirm-message-delivery ──▶ Server
                               │                                    │
Sender ◀── message-delivered ──────────────────────────────────────┘
               (double tick)

Receiver opens chat ──▶ PUT /api/messages/chat/read/:userId
                             │
Sender ◀── message-read ─────┘  (blue tick)
```

### Typing indicators

```
Sender types ──▶ emit typing-start { receiverId }
                      │
Receiver ◀──── user-typing { isTyping: true }

Sender stops ──▶ emit typing-stop { receiverId }
                      │
Receiver ◀──── user-typing { isTyping: false }
```

### Online presence

- Client connects socket → emits `authenticate(userId)`
- Server tracks `onlineUsers` map; broadcasts `user-status-changed` to friends
- Heartbeat every 12s; 45s timeout marks user offline

---

## Mobile Screens — Full Walkthrough

The Flutter app has **13 screens**. All are shown below in mobile phone frames.

---

### Screen 1 — Login

```
  ╔══════════════════════╗
  ║  9:41          ▐▌ ▓  ║  ← status bar
  ╠══════════════════════╣
  ║                      ║
  ║                      ║
  ║      ┌─────────┐     ║
  ║      │    R    │     ║  ← Reon logo
  ║      │ (violet │     ║    (violet-to-cyan
  ║      │  -cyan) │     ║     gradient)
  ║      └─────────┘     ║
  ║                      ║
  ║    Welcome back      ║
  ║   Sign in to         ║
  ║      continue        ║
  ║                      ║
  ║  ┌──────────────────┐║
  ║  │ ✉  Email         │║  ← email field
  ║  └──────────────────┘║
  ║  ┌──────────────────┐║
  ║  │ 🔒 Password    👁 │║  ← password (show/hide)
  ║  └──────────────────┘║
  ║                      ║
  ║  ╔══════════════════╗ ║
  ║  ║     Sign In      ║ ║  ← gradient button
  ║  ╚══════════════════╝ ║
  ║                      ║
  ║  Don't have an       ║
  ║  account?  Sign Up   ║  ← navigate to Sign Up
  ║                      ║
  ╚══════════════════════╝
```

**Route:** Auth gate (unauthenticated)  
**Actions:** Enter email + password → tap Sign In → navigates to HomeScreen (or OnboardingScreen on first login)

---

### Screen 2 — Sign Up

```
  ╔══════════════════════╗
  ║  9:41          ▐▌ ▓  ║
  ╠══════════════════════╣
  ║                      ║
  ║      ┌─────────┐     ║
  ║      │    R    │     ║
  ║      └─────────┘     ║
  ║                      ║
  ║    Create account    ║
  ║                      ║
  ║  ┌──────────────────┐║
  ║  │ 👤  Full Name    │║
  ║  └──────────────────┘║
  ║  ┌──────────────────┐║
  ║  │ ✉   Email        │║
  ║  └──────────────────┘║
  ║  ┌──────────────────┐║
  ║  │ 🔒  Password   👁 │║
  ║  └──────────────────┘║
  ║                      ║
  ║  ╔══════════════════╗ ║
  ║  ║     Sign Up      ║ ║
  ║  ╚══════════════════╝ ║
  ║                      ║
  ║  Already have an     ║
  ║  account?  Sign In   ║
  ║                      ║
  ╚══════════════════════╝
```

**Route:** Pushed from LoginScreen  
**Actions:** Fill name / email / password → tap Sign Up → navigates to OnboardingScreen

---

### Screen 3 — Onboarding

```
  ╔══════════════════════╗
  ║  9:41          ▐▌ ▓  ║
  ╠══════════════════════╣
  ║                      ║
  ║   Set up your        ║
  ║      profile         ║
  ║                      ║
  ║       ┌───────┐      ║
  ║       │       │      ║
  ║       │  👤   │      ║  ← tap to pick from gallery
  ║       │       │      ║
  ║       └───────┘      ║
  ║    Tap to add photo  ║
  ║                      ║
  ║  ┌──────────────────┐║
  ║  │ Bio (optional)   │║
  ║  └──────────────────┘║
  ║  ┌──────────────────┐║
  ║  │ Location         │║
  ║  └──────────────────┘║
  ║                      ║
  ║  ╔══════════════════╗ ║
  ║  ║   Get Started    ║ ║
  ║  ╚══════════════════╝ ║
  ║                      ║
  ╚══════════════════════╝
```

**Route:** Auth gate (authenticated, `isOnboarded = false`)  
**Actions:** Optionally set avatar, bio, location → Get Started → HomeScreen. RSA key pair is generated here.

---

### Screen 4 — Home (Navigation Shell)

```
  ╔══════════════════════╗
  ║  9:41          ▐▌ ▓  ║
  ╠══════════════════════╣
  ║                      ║
  ║   [current tab       ║
  ║    content shown     ║
  ║    here]             ║
  ║                      ║
  ║                      ║
  ║                      ║
  ║                      ║
  ║                      ║
  ║                      ║
  ╠══════════════════════╣
  ║  💬   👥²  🔭  🔔³  ⚙️ ║  ← bottom nav
  ║Chats Friends Disc    ║
  ║       ↑badge  Alerts Settings
  ║            ↑badge    ║
  ╚══════════════════════╝
```

**Tab 0** → Chat List | **Tab 1** → Friends (badge = pending requests) | **Tab 2** → Discover | **Tab 3** → Notifications (badge = unread) | **Tab 4** → Settings  
All tabs use `IndexedStack` so state is preserved when switching.

---

### Screen 5 — Chat List

```
  ╔══════════════════════╗
  ║  9:41          ▐▌ ▓  ║
  ╠══════════════════════╣
  ║  Reon              🔍 ║  ← gradient logo + search
  ║──────────────────────║
  ║  [Chats] │  Groups   ║  ← tab bar
  ║──────────────────────║
  ║                      ║
  ║  ┌────────────────┐  ║
  ║  │ 👤 Alice    🟢 │  ║  ← online dot
  ║  │ Hey, how are   │  ║  ← last message preview
  ║  │           3:41 │  ║  ← timestamp
  ║  └────────────────┘  ║
  ║  ┌────────────────┐  ║
  ║  │ 👤 Bob         │  ║
  ║  │ You: sounds good│  ║  ← "You:" prefix for sent
  ║  │     Yesterday  │  ║
  ║  └────────────────┘  ║
  ║  ┌────────────────┐  ║
  ║  │ 👥 Dev Team    │  ║  ← group (Groups tab)
  ║  │ Alice: PR merge│  ║
  ║  │           2:15 │  ║
  ║  └────────────────┘  ║
  ║                      ║
  ╚══════════════════════╝
```

**Route:** HomeScreen tab 0  
**Actions:** Tap a row → ChatScreen or GroupChatScreen. Pull to refresh. Search by name filters results. Tabs switch between DMs and Groups.

---

### Screen 6 — Direct Message Chat

```
  ╔══════════════════════╗
  ║  9:41          ▐▌ ▓  ║
  ╠══════════════════════╣
  ║ ←  👤 Alice    🟢    ║  ← back, avatar, online dot
  ║    Online            ║  ← status / "typing…"
  ╠══════════════════════╣
  ║ · · · · · · · · · ·  ║
  ║ · · (dot-grid bg)· · ║
  ║              ┌─────┐ ║
  ║              │ Hey! │ ║  ← my bubble (right, gradient)
  ║              │  ✓✓  │ ║  ← read ticks (blue)
  ║              └─────┘ ║
  ║  ┌────────┐          ║
  ║  │ Hi :)  │          ║  ← their bubble (left, card)
  ║  └────────┘          ║
  ║              ┌──────┐║
  ║              │ Cool!│ ║
  ║              │  ✓   │ ║  ← delivered (grey)
  ║              └──────┘║
  ║  ● ● ●               ║  ← animated typing dots
  ╠══════════════════════╣
  ║  ┌────────────────┐ ➤║
  ║  │  Message…      │  ║  ← input field + send button
  ║  └────────────────┘  ║
  ╚══════════════════════╝
```

**Route:** Pushed from ChatListScreen or FriendsScreen  
**Features:** E2EE text, typing indicator, online/offline status, status ticks (sending → sent → delivered → read), load earlier messages, optimistic UI

---

### Screen 7 — Group Chat

```
  ╔══════════════════════╗
  ║  9:41          ▐▌ ▓  ║
  ╠══════════════════════╣
  ║ ←  👥 Dev Team       ║
  ║    4 members         ║
  ╠══════════════════════╣
  ║ · · · · · · · · · ·  ║
  ║  ┌────────────────┐  ║
  ║  │ Alice          │  ║  ← sender name
  ║  │ PR is merged!  │  ║
  ║  └────────────────┘  ║
  ║              ┌──────┐║
  ║              │ Nice!│ ║  ← my message
  ║              │ 3/4✓ │ ║  ← delivered to 3 of 4
  ║              └──────┘║
  ║  ┌────────────────┐  ║
  ║  │ Bob            │  ║
  ║  │ Let's celebrate│  ║
  ║  └────────────────┘  ║
  ║              ┌──────┐║
  ║              │ 🎉   │ ║
  ║              │ 4/4✓✓│ ║  ← read by all 4
  ║              └──────┘║
  ╠══════════════════════╣
  ║  ┌────────────────┐ ➤║
  ║  │  Message…      │  ║
  ║  └────────────────┘  ║
  ╚══════════════════════╝
```

**Route:** Pushed from ChatListScreen (Groups tab)  
**Features:** Per-member E2EE, delivery/read counters, sender name on each bubble, typing indicator

---

### Screen 8 — Friends

```
  ╔══════════════════════╗
  ║  9:41          ▐▌ ▓  ║
  ╠══════════════════════╣
  ║  Friends             ║
  ║──────────────────────║
  ║  [Friends] │ Requests║  ← tab bar (Requests has badge)
  ║──────────────────────║
  ║                      ║
  ║  ┌────────────────┐  ║
  ║  │ 👤 Alice  🟢   │  ║  ← online
  ║  │ [Message] [Remove]│  ← action buttons
  ║  └────────────────┘  ║
  ║  ┌────────────────┐  ║
  ║  │ 👤 Bob    ⚫   │  ║  ← offline
  ║  │ [Message] [Remove]│
  ║  └────────────────┘  ║
  ║                      ║
  ║  ── Requests tab ──  ║
  ║  ┌────────────────┐  ║
  ║  │ 👤 Carol       │  ║  ← incoming request
  ║  │ [Accept] [Reject]│  ← accept / reject
  ║  └────────────────┘  ║
  ║  ┌────────────────┐  ║
  ║  │ 👤 Dan         │  ║  ← outgoing (sent by me)
  ║  │    [Withdraw]  │  ║
  ║  └────────────────┘  ║
  ╚══════════════════════╝
```

**Route:** HomeScreen tab 1  
**Features:** Two tabs — Friends (Message / Remove) and Requests (Received: Accept/Reject, Sent: Withdraw). Real-time updates via socket events.

---

### Screen 9 — Discover (Recommendations)

```
  ╔══════════════════════╗
  ║  9:41          ▐▌ ▓  ║
  ╠══════════════════════╣
  ║  Discover            ║
  ║──────────────────────║
  ║                      ║
  ║  ┌────────────────┐  ║
  ║  │   👤 Eve       │  ║
  ║  │  "Designer"    │  ║  ← bio
  ║  │   London       │  ║  ← location
  ║  │    [Add →]     │  ║  ← send friend request
  ║  └────────────────┘  ║
  ║  ┌────────────────┐  ║
  ║  │   👤 Frank     │  ║
  ║  │  "Developer"   │  ║
  ║  │   Berlin       │  ║
  ║  │   [Withdraw]   │  ║  ← already sent, can cancel
  ║  └────────────────┘  ║
  ║  ┌────────────────┐  ║
  ║  │   👤 Grace     │  ║
  ║  │  sent you a    │  ║
  ║  │   request      │  ║
  ║  │[Accept] [Reject]│  ║
  ║  └────────────────┘  ║
  ║                      ║
  ╚══════════════════════╝
```

**Route:** HomeScreen tab 2  
**Actions:** Add / Withdraw / Accept / Reject depending on request state. Pull to refresh.

---

### Screen 10 — Notifications (Alerts)

```
  ╔══════════════════════╗
  ║  9:41          ▐▌ ▓  ║
  ╠══════════════════════╣
  ║  Alerts      [✓ All] ║  ← mark all read
  ║──────────────────────║
  ║                      ║
  ║  ┌────────────────┐  ║
  ║  │ 🔵 Alice sent  │  ║  ← blue dot = unread
  ║  │    a friend    │  ║
  ║  │    request     │  ║
  ║  │    2 min ago   │  ║
  ║  └────────────────┘  ║
  ║  ┌────────────────┐  ║
  ║  │    Bob accepted│  ║  ← no dot = read
  ║  │    your request│  ║
  ║  │    1 hr ago    │  ║
  ║  └────────────────┘  ║
  ║  ┌────────────────┐  ║
  ║  │ 🔵 New message │  ║
  ║  │    from Carol  │  ║
  ║  │    Yesterday   │  ║
  ║  └────────────────┘  ║
  ║                      ║
  ╚══════════════════════╝
```

**Route:** HomeScreen tab 3  
**Features:** Unread items have a blue dot. Tap to mark one read. "✓ All" marks everything read. Badge on home nav tab decrements in real time.

---

### Screen 11 — Settings

```
  ╔══════════════════════╗
  ║  9:41          ▐▌ ▓  ║
  ╠══════════════════════╣
  ║  Settings            ║
  ╠══════════════════════╣
  ║      ┌─────────┐     ║
  ║      │   👤    │     ║  ← avatar (tap to change)
  ║      └─────────┘     ║
  ║  ┌──────────────────┐║
  ║  │  Full Name       │║
  ║  └──────────────────┘║
  ║  ┌──────────────────┐║
  ║  │  Bio…            │║
  ║  └──────────────────┘║
  ║  ┌──────────────────┐║
  ║  │  Location…       │║
  ║  └──────────────────┘║
  ║  ╔══════════════════╗ ║
  ║  ║  Save Profile    ║ ║
  ║  ╚══════════════════╝ ║
  ║──────────────────────║
  ║  Privacy             ║
  ║  Show last seen  [✓] ║  ← toggle
  ║  Show online     [✓] ║  ← toggle
  ║  ╔══════════════════╗ ║
  ║  ║  Save Privacy    ║ ║
  ║  ╚══════════════════╝ ║
  ║──────────────────────║
  ║  ╔══════════════════╗ ║
  ║  ║  Link Device  📱 ║ ║  ← opens QR generator
  ║  ╚══════════════════╝ ║
  ║──────────────────────║
  ║  Change Password     ║
  ║  ┌──────────────────┐║
  ║  │  Current password│║
  ║  └──────────────────┘║
  ║  ┌──────────────────┐║
  ║  │  New password    │║
  ║  └──────────────────┘║
  ║  ╔══════════════════╗ ║
  ║  ║ Save Password    ║ ║
  ║  ╚══════════════════╝ ║
  ║──────────────────────║
  ║  ╔══════════════════╗ ║
  ║  ║    Log Out       ║ ║
  ║  ╚══════════════════╝ ║
  ╚══════════════════════╝
```

**Route:** HomeScreen tab 4  
**Features:** Profile editing (name, bio, location, avatar), privacy toggles, device linking button, password change, logout. All sections save independently.

---

### Screen 12 — Generate QR (Settings → Link Device)

```
  ╔══════════════════════╗
  ║  9:41          ▐▌ ▓  ║
  ╠══════════════════════╣
  ║ ←  Link Device       ║
  ╠══════════════════════╣
  ║                      ║
  ║  Scan this QR code   ║
  ║  from your new       ║
  ║  device              ║
  ║                      ║
  ║      ┌───────────┐   ║
  ║      │█▀▀▀▀▀▀▀▀█│   ║
  ║      │█ ███████ █│   ║
  ║      │█ █     █ █│   ║  ← generated QR code
  ║      │█ █ ███ █ █│   ║    (ECDH pub key + sessionId)
  ║      │█ █ ███ █ █│   ║
  ║      │█ █     █ █│   ║
  ║      │█ ███████ █│   ║
  ║      │█▄▄▄▄▄▄▄▄█│   ║
  ║      └───────────┘   ║
  ║                      ║
  ║   Expires in 05:00   ║  ← countdown timer
  ║                      ║
  ╚══════════════════════╝
```

**Route:** Pushed from SettingsScreen  
**What it does:** Generates a temporary ECDH P-256 public key, registers a link session on the server, and shows it as a QR code for Device B to scan.

---

### Screen 13 — QR Scanner (Link Device)

```
  ╔══════════════════════╗
  ║  9:41          ▐▌ ▓  ║
  ╠══════════════════════╣
  ║ ←  Link Device       ║
  ╠══════════════════════╣
  ║                      ║
  ║  Point camera at     ║
  ║  the QR code on      ║
  ║  your other device   ║
  ║                      ║
  ║  ┌────────────────┐  ║
  ║  │                │  ║
  ║  │  [live camera] │  ║  ← mobile_scanner viewfinder
  ║  │   ┌────────┐   │  ║
  ║  │   │ scan   │   │  ║  ← animated scan overlay
  ║  │   │ target │   │  ║
  ║  │   └────────┘   │  ║
  ║  │                │  ║
  ║  └────────────────┘  ║
  ║                      ║
  ║   Waiting for scan…  ║
  ║                      ║
  ╚══════════════════════╝
```

**Route:** `/link-device` (named route)  
**What it does:** Opens camera, scans the QR from Device A, performs ECDH key exchange, decrypts and imports the RSA private key, stores it in secure storage.

---

### Screen navigation map

```
                    ┌─────────────┐
           ┌────────│  LoginScreen │────────┐
           │        └─────────────┘        │
           ▼                               ▼
   ┌─────────────┐               ┌──────────────────┐
   │ SignupScreen│               │ OnboardingScreen  │
   └─────────────┘               └────────┬─────────┘
                                          │
                               ┌──────────▼──────────┐
                               │     HomeScreen       │
                               │  (IndexedStack nav)  │
                               └──┬──┬──┬──┬──┬──────┘
                     tab 0 ───────┘  │  │  │  └── tab 4
                     tab 1 ──────────┘  │  └────── tab 3
                     tab 2 ─────────────┘
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
  ChatListScreen  FriendsScreen  RecommendationsScreen
         │
    ┌────┴────┐
    ▼         ▼
ChatScreen  GroupChatScreen
                              SettingsScreen (tab 4)
                                      │
                              SettingsLinkDeviceScreen
                                      │
                              LinkDeviceScreen (/link-device)
```

---

## Web Routes

Next.js App Router — all pages under `frontend/app/`.

### Public routes `(auth)/`

| Route | Description |
|-------|-------------|
| `/login` | Email/password + Google OAuth link |
| `/signup` | Registration |
| `/onboarding` | Username, bio, language, avatar |

### Authenticated routes `(main)/`

| Route | Description |
|-------|-------------|
| `/chat` | Chat list (DMs + Groups tabs) |
| `/chat/[userId]` | 1:1 conversation |
| `/group/[groupId]` | Group chat + member management |
| `/friends` | Friends list + friend requests |
| `/recommendations` | Discover people |
| `/notifications` | Notification centre |
| `/settings` | Profile, privacy, password |
| `/settings/link-device` | Show QR to link keys (Device A) |
| `/link-device` | Scan QR to receive keys (Device B) |

---

## REST API Reference

All routes are prefixed with `/api`. Protected routes require a valid JWT cookie.

### Messages — `/api/messages`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/send` | Send 1:1 message (multipart, up to 10 files) |
| GET | `/:receiverId` | Paginated message history |
| GET | `/sidebar/list` | Chat sidebar (last message per friend) |
| GET | `/search?q=` | Search users by name/username |
| PUT | `/chat/read/:userId` | Mark entire chat as read |
| GET | `/:messageId/info` | Delivery/read metadata |
| POST | `/read/:messageId` | Mark single message read |
| GET | `/media/:id` | Serve encrypted media |
| GET | `/download/:id` | Download encrypted file |

### Groups — `/api/groups`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Create group |
| GET | `/` | List user's groups |
| GET | `/:groupId` | Group details |
| PUT | `/:groupId` | Update name/description |
| PATCH | `/:groupId/avatar` | Upload group avatar |
| DELETE | `/:groupId` | Delete group |
| POST | `/:groupId/members` | Add members |
| DELETE | `/:groupId/members/:memberId` | Remove member |
| PATCH | `/:groupId/admins/:memberId` | Promote to admin |
| POST | `/:groupId/messages` | Send group message |
| GET | `/:groupId/messages` | Paginated group messages |
| PUT | `/:groupId/read` | Mark group chat read |
| GET | `/messages/:messageId/info` | Group message receipts |

### Friends — `/api/users`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/recommendation` | Discover users |
| GET | `/friends` | Friend list |
| PATCH | `/friends/:id` | Remove friend |
| POST | `/friend-request/:id` | Send request |
| POST | `/friend-request/:id/accept` | Accept request |
| POST | `/friend-request/:id/withdraw` | Withdraw request |
| DELETE | `/friend-request/:id` | Reject request |
| GET | `/friend-requests/received` | Incoming requests |
| GET | `/friend-requests/sent` | Outgoing requests |
| GET | `/friend-request/pending-count` | Badge count |

### Keys — `/api/keys`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/uploadPublicKey` | — | Upload RSA public JWK |
| GET | `/publicKey/:userId` | — | Fetch user's public key |
| POST | `/link-session/create` | ✓ | Start device-link session |
| PUT | `/link-session/:id/claim` | ✓ | New device claims session |
| PUT | `/link-session/:id/transfer` | ✓ | Upload encrypted private key |
| GET | `/link-session/:id` | ✓ | Poll session status |

### Settings — `/api/settings`

| Method | Path | Description |
|--------|------|-------------|
| PUT | `/profile` | Update name, bio, location, avatar |
| PUT | `/change-password` | Change or set password |
| PATCH | `/privacy` | Update privacy toggles |

### Notifications — `/api/notifications`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List notifications |
| PATCH | `/:id/read` | Mark one read |
| PATCH | `/read-all` | Mark all read |
| DELETE | `/:id` | Delete one |
| DELETE | `/` | Clear all |

---

## Socket.io Events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `authenticate` | `userId` | Bind socket to user |
| `heartbeat` | — | Keep-alive |
| `request-online-friends` | — | Get online friend IDs |
| `typing-start` | `{ receiverId }` | Start typing in DM |
| `typing-stop` | `{ receiverId }` | Stop typing in DM |
| `message-read` | `{ messageId, senderId }` | Read receipt |
| `confirm-message-delivery` | `{ messageId, senderId }` | Delivery ack |
| `join-groups` | — | Join all group rooms |
| `group-typing-start` | `{ groupId }` | Group typing indicator |
| `group-typing-stop` | `{ groupId }` | Stop group typing |
| `group-message-delivered` | `{ messageId, groupId }` | Group delivery ack |

### Server → Client

| Event | Description |
|-------|-------------|
| `authenticated` | Auth success + `onlineFriends` list |
| `user-status-changed` | Friend online/offline + `lastSeen` |
| `user-typing` | DM typing indicator |
| `new-message` | Incoming 1:1 message |
| `message-sent` | Outgoing message confirmed |
| `message-delivered` | Message reached recipient |
| `messages-delivered-batch` | Batch delivery update |
| `message-read` | Message read by recipient |
| `new-group-message` | Incoming group message |
| `group-message-delivered` | Group delivery receipt |
| `group-user-typing` | Group typing indicator |
| `group-messages-read` | Group read receipts |
| `group-added` / `group-updated` / `group-deleted` | Group changes |
| `friend-request-received` | Incoming friend request |
| `friend-request-accepted-realtime` | Request accepted |
| `friend-request-rejected` | Request rejected |
| `friend-request-withdrawn` | Request withdrawn |
| `friend-removed` | Friend removed |
| `pending-requests-count-updated` | Badge count update |
| `device-link-claimed` | Device B claimed link session |
| `device-link-ready` | Encrypted key ready for Device B |

---

## Environment Variables

### Backend (`backend/.env`)

```env
PORT=5001
NODE_ENV=development
MONGO_URI=mongodb+srv://...
JWT_SECRET=your_long_random_secret
FRONTEND_URL=http://localhost:3000
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

### Web (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:5001/api
NEXT_PUBLIC_SOCKET_URL=http://localhost:5001
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### Mobile (`flutter_app/lib/config.dart`)

```dart
const String API_BASE   = 'http://10.0.2.2:5001/api';   // Android emulator
const String SOCKET_URL = 'http://10.0.2.2:5001';
const String SITE_URL   = 'http://localhost:3000';
```

Or pass at build time:

```powershell
flutter run `
  --dart-define=API_BASE=http://192.168.1.100:5001/api `
  --dart-define=SOCKET_URL=http://192.168.1.100:5001
```

---

## Flutter Setup & Build APK

Follow every step in order.

---

### Step 1 — Install Java (JDK)

Flutter's Android toolchain requires Java 17.

1. Download **JDK 17** from https://adoptium.net (choose `Temurin 17 LTS`)
2. Run the installer — it will add Java to your PATH automatically
3. Verify:
   ```powershell
   java -version
   ```
   Expected: `openjdk version "17.x.x"`

---

### Step 2 — Install Android Studio

1. Download from https://developer.android.com/studio
2. Run the installer with default options
3. On first launch, complete the **Android Studio Setup Wizard** — this installs:
   - Android SDK
   - Android SDK Platform-Tools
   - Android Emulator
4. After the wizard, open **SDK Manager** (top-right gear icon → SDK Manager):
   - **SDK Platforms tab**: Install **Android 14 (API 34)** or newer
   - **SDK Tools tab**: Check and install:
     - Android SDK Build-Tools (latest)
     - Android SDK Command-line Tools (latest)
     - Android SDK Platform-Tools
     - NDK (Side by side) — version 26+ recommended

---

### Step 3 — Install Flutter SDK

1. Go to https://docs.flutter.dev/get-started/install/windows
2. Click **"Download Flutter SDK"** — you get a zip like `flutter_windows_3.x.x-stable.zip`
3. Extract to a path **with no spaces or special characters**, for example:
   ```
   C:\flutter
   ```
4. Add Flutter to your PATH:
   - Press `Win + R` → type `sysdm.cpl` → OK
   - Go to **Advanced** tab → **Environment Variables**
   - Under **User variables**, select `Path` → click **Edit**
   - Click **New** → type `C:\flutter\bin`
   - Click **OK** on all windows
5. Open a **new** PowerShell and verify:
   ```powershell
   flutter --version
   ```

---

### Step 4 — Accept Android Licenses

```powershell
flutter doctor --android-licenses
```

Press `y` + Enter for every prompt (there are usually 5–7).

---

### Step 5 — Verify Full Setup

```powershell
flutter doctor -v
```

All items must show a green checkmark `[✓]`. Common fixes:

| Issue | Fix |
|-------|-----|
| `Android toolchain not found` | Re-run Android Studio SDK Manager |
| `cmdline-tools component is missing` | SDK Manager → SDK Tools → Android SDK Command-line Tools |
| `Unable to find bundled Java version` | Set `JAVA_HOME` to your JDK 17 path |
| `Flutter plugin not installed` | Install Flutter + Dart plugins in Android Studio |

To set `JAVA_HOME` manually in PowerShell:
```powershell
# Add to Environment Variables → System variables → JAVA_HOME
# Value: C:\Program Files\Eclipse Adoptium\jdk-17.x.x.x-hotspot
```

---

### Step 6 — Open the Flutter Project

```powershell
cd "C:\Users\HP 15s fq4014ne\Documents\Zainab rAza\reon\Reon\flutter_app"
```

---

### Step 7 — Configure the Backend URL

Open [lib/config.dart](flutter_app/lib/config.dart) and set your server addresses:

```dart
// For Android emulator (backend running on your PC)
const String API_BASE   = 'http://10.0.2.2:5001/api';
const String SOCKET_URL = 'http://10.0.2.2:5001';
const String SITE_URL   = 'http://localhost:3000';

// For a physical phone on the same WiFi (replace with your PC's IP)
// const String API_BASE   = 'http://192.168.1.100:5001/api';
// const String SOCKET_URL = 'http://192.168.1.100:5001';

// For production
// const String API_BASE   = 'https://api.yourdomain.com/api';
// const String SOCKET_URL = 'https://api.yourdomain.com';
```

---

### Step 8 — Install Dependencies

```powershell
flutter pub get
```

---

### Step 9 — Build a Debug APK (Quick Test)

```powershell
flutter build apk --debug
```

The APK is at:
```
build\app\outputs\flutter-apk\app-debug.apk
```

To install directly on a connected phone:
```powershell
flutter install
```

---

### Step 10 — Build a Release APK (For Distribution)

A release APK must be signed. Follow these sub-steps.

#### 10a — Create a Keystore (one-time, keep the file safe)

```powershell
# keytool is in your JDK bin folder
# If it's not on PATH, use the full path:
# & "C:\Program Files\Eclipse Adoptium\jdk-17.x.x.x-hotspot\bin\keytool.exe" ...

keytool -genkey -v `
  -keystore reon-release.jks `
  -keyalg RSA `
  -keysize 2048 `
  -validity 10000 `
  -alias reon
```

You'll be prompted for a store password, key password, and identity details. Remember your passwords — you cannot recover them.

Move the resulting `reon-release.jks` into:
```
flutter_app\android\app\reon-release.jks
```

#### 10b — Create key.properties

Create a new file at `flutter_app\android\key.properties`:

```properties
storePassword=YOUR_STORE_PASSWORD
keyPassword=YOUR_KEY_PASSWORD
keyAlias=reon
storeFile=reon-release.jks
```

Add `android/key.properties` to `.gitignore` — never commit this file.

#### 10c — Wire Up Gradle Signing

Open [android/app/build.gradle](flutter_app/android/app/build.gradle) and add the signing config:

```gradle
// At the top of the android {} block, before android {
def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file('key.properties')
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    // ... existing content ...

    signingConfigs {
        release {
            keyAlias     keystoreProperties['keyAlias']
            keyPassword  keystoreProperties['keyPassword']
            storeFile    keystoreProperties['storeFile'] ? file(keystoreProperties['storeFile']) : null
            storePassword keystoreProperties['storePassword']
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.release
            // minifyEnabled and shrinkResources can be enabled for smaller APK
        }
    }
}
```

#### 10d — Build the Release APK

```powershell
flutter build apk --release
```

Output:
```
build\app\outputs\flutter-apk\app-release.apk
```

#### 10e — Build Split APKs (Smaller, One per CPU Architecture)

```powershell
flutter build apk --split-per-abi --release
```

This produces three smaller APKs:
```
build\app\outputs\flutter-apk\app-armeabi-v7a-release.apk   # older 32-bit phones
build\app\outputs\flutter-apk\app-arm64-v8a-release.apk     # modern 64-bit phones (most common)
build\app\outputs\flutter-apk\app-x86_64-release.apk        # emulators
```

For distributing to real phones, use `app-arm64-v8a-release.apk`.

---

### Step 11 — Install APK on a Physical Android Phone

#### Via USB

1. Enable **Developer Options** on your phone:
   - Settings → About Phone → tap **Build Number** 7 times
2. Enable **USB Debugging**:
   - Settings → Developer Options → USB Debugging → On
3. Connect phone via USB, accept the debugging prompt on the phone
4. Check Flutter sees the device:
   ```powershell
   flutter devices
   ```
5. Run or install:
   ```powershell
   flutter run --release        # run directly
   flutter install              # install the APK
   ```

#### Via File Transfer

1. Copy `app-release.apk` to your phone (USB, Google Drive, email, etc.)
2. On the phone, open the APK file using **Files** app
3. If prompted, allow installation from unknown sources in Settings → Security

---

### Step 12 — Build an App Bundle (for Google Play Store)

```powershell
flutter build appbundle --release
```

Output:
```
build\app\outputs\bundle\release\app-release.aab
```

Upload this `.aab` file to the Google Play Console.

---

### Quick Reference — All Build Commands

```powershell
# Get dependencies
flutter pub get

# Run in debug mode on connected device
flutter run

# Build debug APK
flutter build apk --debug

# Build release APK (single, all archs)
flutter build apk --release

# Build release APK (split by arch, smaller files)
flutter build apk --split-per-abi --release

# Build release App Bundle (Google Play)
flutter build appbundle --release

# Clean build cache (use when builds behave unexpectedly)
flutter clean
flutter pub get
flutter build apk --release
```

---

## Backend & Web Setup

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- Cloudinary account

### Backend

```powershell
cd backend
npm install
# Copy .env.example to .env and fill in values
npm run dev     # starts on port 5001
```

### Web Frontend

```powershell
cd frontend
npm install
# Create .env.local (see Environment Variables section)
npm run dev     # starts on http://localhost:3000
```

### First-run checklist
1. Start MongoDB and backend
2. Start web frontend
3. Register a new account at `/signup`
4. Complete onboarding (generates RSA keys automatically)
5. On mobile, set `config.dart` to point to your backend
6. Register a second account for testing
7. Add each other via Discover
8. Send an encrypted message

---

## Deployment Notes

| Service | Suggested Host | Notes |
|---------|---------------|-------|
| Backend | Render, Railway, Fly.io | Set `FRONTEND_URL` to web domain |
| Web | Vercel | Set `NEXT_PUBLIC_*` env vars |
| MongoDB | MongoDB Atlas | Free tier works for development |
| Cloudinary | cloudinary.com | Profile picture CDN |
| Mobile | Google Play / sideload | Update `config.dart` to production URL |

**CORS:** Add your production web URL to `FRONTEND_URL`.  
**Cookies:** In production ensure `secure: true` and `sameSite` are correctly set for your domain.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `flutter: command not found` | Add `C:\flutter\bin` to PATH, restart terminal |
| `Android toolchain — No toolchain found` | Install/configure Android Studio SDK |
| `cmdline-tools component is missing` | SDK Manager → SDK Tools → Android SDK Command-line Tools |
| `License not accepted` | Run `flutter doctor --android-licenses` |
| `Gradle build failed (JAVA_HOME)` | Set `JAVA_HOME` env variable to JDK 17 path |
| `keytool: command not found` | Add JDK `bin` folder to PATH |
| App crashes on launch | Verify `config.dart` URLs point to a running backend |
| `[decryption failed]` in messages | Log out and log back in to regenerate/restore keys |
| QR scan not working | Grant Camera permission: Settings → Apps → Reon → Permissions |
| Socket not connecting | Check backend is running; check firewall on port 5001 |
| `MissingPluginException` | Run `flutter clean && flutter pub get` then rebuild |
| Images not loading | Verify Cloudinary is configured in the backend `.env` |

---

*Built with Flutter · Encrypted with PointyCastle · Real-time with Socket.IO*
