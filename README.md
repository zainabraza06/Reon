# Reon — End-to-End Encrypted Messenger

> A privacy-first, real-time messaging platform.  
> Every message is encrypted on your device — the server **never** sees plaintext.

| App | Stack | Purpose |
|-----|-------|---------|
| **Web** | Next.js 16, React 19, TypeScript, Tailwind CSS 4 | Full-featured web client |
| **Mobile** | Flutter 3.32.2, Provider, Dio | Android (and iOS) client |
| **Backend** | Node.js, Express, MongoDB, Socket.io | REST API + real-time relay |

[![Backend CI](https://github.com/zainabraza06/reon/actions/workflows/backend.yml/badge.svg)](https://github.com/zainabraza06/reon/actions/workflows/backend.yml)
[![Flutter CI](https://github.com/zainabraza06/reon/actions/workflows/flutter.yml/badge.svg)](https://github.com/zainabraza06/reon/actions/workflows/flutter.yml)
[![Frontend CI](https://github.com/zainabraza06/reon/actions/workflows/frontend.yml/badge.svg)](https://github.com/zainabraza06/reon/actions/workflows/frontend.yml)

---

## Table of Contents

1. [Features](#features)
2. [System Architecture](#system-architecture)
3. [Repository Structure](#repository-structure)
4. [Tech Stack](#tech-stack)
5. [Testing](#testing)
6. [Data Models](#data-models)
7. [Authentication Flow](#authentication-flow)
8. [End-to-End Encryption](#end-to-end-encryption)
9. [Device Linking Flow](#device-linking-flow)
10. [Messaging Flows](#messaging-flows)
11. [Mobile Screens — Full Walkthrough](#mobile-screens--full-walkthrough)
12. [Web Routes](#web-routes)
13. [REST API Reference](#rest-api-reference)
14. [Socket.io Events](#socketio-events)
15. [Environment Variables](#environment-variables)
16. [Flutter Setup & Build APK](#flutter-setup--build-apk)
17. [Firebase Push Notifications Setup](#firebase-push-notifications-setup)
18. [Backend & Web Setup](#backend--web-setup)
19. [CI/CD](#cicd)
20. [Deployment Notes](#deployment-notes)
21. [Troubleshooting](#troubleshooting)

---

## Features

### Communication
- **1:1 direct messages** — text, images, video, audio, documents, voice notes
- **Group chats** — create groups, add/remove members, admin promotion, encrypted group messages
- **Real-time delivery** — Socket.io for instant push, typing indicators, read receipts, online presence
- **Message info** — delivery and read timestamps per message
- **Offline message cache** — messages load instantly from device storage before the network responds; up to 200 messages per conversation persisted locally with Hive

### Security & Privacy
- **RSA-2048 + AES-256-GCM** hybrid encryption — server is a blind relay
- **Per-user RSA key pairs** — generated client-side; private key stays in platform secure storage (Android Keystore)
- **Device linking** — transfer private keys via ECDH P-256 + QR code (server never sees the private key)
- **Privacy settings** — toggle last-seen and online-status visibility

### Push Notifications
- **Firebase Cloud Messaging** — push notification delivered when the recipient is offline
- **Foreground notifications** — local notification shown while the app is open
- **Token lifecycle** — FCM token uploaded on login, deleted on logout; stale tokens auto-purged

### Social
- **Friend requests** — send, accept, reject, withdraw
- **Friend management** — list, remove, message directly
- **Discover** — user recommendations with search
- **Notifications** — persisted notification centre with real-time badge updates

### Media & Storage
- **Encrypted file storage** — media blobs in MongoDB GridFS (`encryptedFiles` bucket)
- **Profile pictures** — Cloudinary CDN
- **Voice notes** — record and send encrypted audio messages

### Quality & Engineering
- **Integration tests** — 18 backend tests covering auth, friends, and messages (Jest + Supertest + mongodb-memory-server)
- **Unit tests** — 15+ Flutter tests covering all data models and auth provider state
- **CI/CD** — GitHub Actions pipelines for all three apps
- **Clean architecture** — business logic separated from UI via dedicated Provider classes

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
             │  HTTPS + cookies             │  HTTPS + cookies
             │  WebSocket (socket_io)       │  WebSocket (socket.io)
             ▼                             ▼
┌─────────────────────────────────────────────────────────┐
│                   Backend (Node.js)                     │
│                                                         │
│   ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│   │  Express API │  │  Socket.io   │  │  Firebase   │  │
│   │   /api/*     │  │   Server     │  │  Admin SDK  │  │
│   └──────┬───────┘  └──────┬───────┘  └──────┬──────┘  │
└──────────┼────────────────┼─────────────────┼───────────┘
           │                │                 │
           ▼                ▼                 ▼
┌────────────────────┐  ┌────────────┐  ┌──────────────────┐
│     MongoDB        │  │ Cloudinary │  │  FCM (Firebase)  │
│  Users, Messages,  │  │  Profile   │  │  Push to offline │
│  Groups, Keys,     │  │  pictures  │  │  recipients      │
│  Notifs, GridFS    │  └────────────┘  └──────────────────┘
└────────────────────┘
```

---

## Repository Structure

```
Reon/
├── .github/
│   └── workflows/
│       ├── backend.yml        # Jest tests on every push
│       ├── flutter.yml        # analyze + test + build APK
│       └── frontend.yml       # lint + type-check + build
│
├── backend/
│   ├── jest.config.cjs        # Jest config (ESM, mongodb-memory-server)
│   └── src/
│       ├── app.js             # Express factory — importable in tests
│       ├── server.js          # HTTP + socket bootstrap
│       ├── controllers/       # Business logic (auth, messages, friends…)
│       ├── models/            # Mongoose schemas
│       ├── routes/            # Express routers
│       ├── middlewares/       # Auth, upload, validation
│       ├── lib/
│       │   ├── socket.js      # Socket.io + FCM push for offline users
│       │   ├── fcm.js         # Firebase Cloud Messaging helper
│       │   ├── db.js
│       │   └── cloudinary.js
│       └── tests/
│           ├── globalSetup.js    # Start mongodb-memory-server
│           ├── globalTeardown.js # Stop mongodb-memory-server
│           ├── setup.js          # DB connect / wipe between tests
│           ├── auth.test.js      # 7 tests — signup, login, me, logout
│           ├── friend.test.js    # 6 tests — requests, accept, list
│           └── message.test.js   # 5 tests — send, fetch, mark-read
│
├── frontend/
│   ├── app/
│   │   ├── (auth)/            # Login, signup, onboarding
│   │   └── (main)/            # Authenticated app shell
│   ├── components/
│   ├── context/               # Auth, Notification, Socket contexts
│   ├── hooks/
│   └── lib/                   # api.ts, crypto.ts, socket.ts
│
├── flutter_app/
│   ├── lib/
│   │   ├── main.dart          # Entry: Hive init → Firebase init → app
│   │   ├── config.dart        # API_BASE, SOCKET_URL, SITE_URL
│   │   ├── providers/
│   │   │   ├── auth_provider.dart   # Auth state + FCM/cache cleanup on logout
│   │   │   └── chat_provider.dart   # All chat logic (socket, crypto, cache, API)
│   │   ├── screens/           # Pure UI — no business logic in screens
│   │   ├── services/
│   │   │   ├── api_service.dart
│   │   │   ├── socket_service.dart
│   │   │   ├── crypto_service.dart
│   │   │   ├── notification_service.dart  # FCM init, foreground display, token
│   │   │   └── message_cache_service.dart # Hive offline cache
│   │   ├── models/
│   │   ├── widgets/
│   │   └── theme/
│   └── test/
│       ├── models_test.dart       # 15 tests — ChatMessage, ReonUser, Notif, Request
│       └── auth_provider_test.dart # AuthProvider state tests
│
└── README.md
```

---

## Tech Stack

### Mobile (`flutter_app/`)
| Layer | Technology |
|-------|-----------|
| Framework | Flutter 3.x (Dart ≥ 3.2) |
| State | Provider + ChangeNotifier |
| HTTP | Dio + cookie_jar + dio_cookie_manager |
| Real-time | socket_io_client |
| Crypto | pointycastle (RSA-OAEP + AES-GCM + ECDH P-256) |
| Secure storage | flutter_secure_storage (Android Keystore) |
| Offline cache | hive_flutter |
| Push notifications | firebase_messaging + flutter_local_notifications |
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
| File storage | GridFS (encrypted media) |
| Images | Cloudinary |
| Auth | Passport.js, JWT (httpOnly cookies), bcryptjs |
| Real-time | Socket.io 4 |
| Push | Firebase Admin SDK (FCM) |
| Security | Helmet, express-rate-limit, CORS |
| Testing | Jest + Supertest + mongodb-memory-server |

---

## Testing

### Backend — 18 integration tests

Tests use `mongodb-memory-server` — no real database or environment required.

```bash
cd backend
NODE_OPTIONS=--experimental-vm-modules npx jest
```

| File | Tests |
|------|-------|
| `auth.test.js` | Signup, duplicate email, missing fields, login, wrong password, unknown email, `/me`, logout |
| `friend.test.js` | Empty friend list, send request, duplicate request, received requests, accept flow, pending count |
| `message.test.js` | Sidebar list, send encrypted message, fetch history, mark-read, auth guard |

### Flutter — 15+ unit tests

```bash
cd flutter_app
flutter test
```

| File | Tests |
|------|-------|
| `models_test.dart` | `ChatMessage` parse, nested objects, defaults, `copyWith`, `isSending`, `isFailed`; `ReonUser` parse, defaults, `copyWith`; `AppNotification`; `FriendRequest` |
| `auth_provider_test.dart` | Initial state, `updateUser`, `updateOnlineStatus` for matching and unknown userId |

---

## Data Models

### MongoDB collections

| Collection | Description |
|-----------|-------------|
| `users` | Accounts, profiles, privacy settings, friend list, `fcmToken` |
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
| `isVoiceMessage` | bool | Whether the audio attachment is a voice note |
| `delivered` / `read` | bool | Delivery and read receipts |

---

## Authentication Flow

```
App Start
    │
    ▼
Auth status?
    ├── unknown ────────────────▶  Loading spinner
    ├── unauthenticated ─────────▶  LoginScreen / SignupScreen
    └── authenticated
            │
            ▼
        isOnboarded?
            ├── No ──────────────▶  OnboardingScreen (generates RSA keypair)
            └── Yes
                    │
                    ▼
                needsDeviceLink?
                    ├── Yes ──────▶  _DeviceLinkGateScreen
                    │                   │
                    │               (Scan QR from original device)
                    │                   │
                    │               LinkDeviceScreen
                    │                   │ (success)
                    │                   ▼
                    └── No ───────▶  HomeScreen
```

### Auth methods
- **Email + password** — `POST /api/auth/signup`, `POST /api/auth/login`
- **Google Sign-In (mobile)** — `POST /api/auth/google-mobile` with Google ID token; available on both Login and Signup screens
- **Google OAuth (web)** — `GET /api/auth/google` → callback sets JWT cookie
- **Session** — JWT in httpOnly cookie; `protectRoute` middleware validates on every protected request

### needsDeviceLink gate

When a user logs in on a device that has never held their private key (e.g. a factory-reset phone or a second device), `AuthProvider._ensureKeys()` detects the mismatch — server has a public key but the device has no private key — and sets `needsDeviceLink = true`. The app shows `_DeviceLinkGateScreen` instead of `HomeScreen`.

**Why this matters**: generating a new key pair here would upload a new public key, making every existing encrypted message unreadable. The user must transfer their original private key via ECDH QR linking instead.

After `LinkDeviceScreen` completes, the gate calls `CryptoService.instance.hasKeyPair()` to confirm the key arrived, then calls `AuthProvider.clearNeedsDeviceLink()` to proceed to `HomeScreen`.

### Auth API routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/signup` | — | Register |
| POST | `/api/auth/login` | — | Login (rate-limited) |
| POST | `/api/auth/logout` | — | Clear session |
| GET | `/api/auth/me` | ✓ | Current user |
| POST | `/api/auth/onboard` | ✓ | Complete profile setup |
| POST | `/api/auth/forgot-password` | — | Send reset email |
| POST | `/api/auth/forgot-password/reset` | — | Reset password |
| GET | `/api/auth/google` | — | Google OAuth (web) |
| POST | `/api/auth/google-mobile` | — | Google Sign-In (mobile ID token) |

---

## End-to-End Encryption

The server is a **blind relay** — it stores and forwards ciphertext only.

### Text messages (1:1)
```
Sender                           Server              Receiver
  │  1. Generate AES-256 key       │                    │
  │  2. Encrypt plaintext AES-GCM  │                    │
  │  3. Wrap AES key (receiver RSA)│                    │
  │  4. Wrap AES key (sender RSA)  │                    │
  │── POST ciphertext + keys ──────▶── push ───────────▶│
  │                                │  5. Unwrap AES key │
  │                                │  6. Decrypt cipher │
```

### Group messages
One AES key per message, RSA-encrypted separately for **each group member**.

### Key storage

| Platform | Private key | Public key |
|----------|------------|-----------|
| Web | IndexedDB (`reon-crypto`) | IndexedDB + server |
| Mobile | flutter_secure_storage | Secure storage + server |

### Crypto algorithms

| Purpose | Algorithm |
|---------|-----------|
| Key wrapping | RSA-2048 OAEP-SHA256 |
| Content encryption | AES-256-GCM |
| Device linking | ECDH P-256 + AES-GCM |

---

## Device Linking Flow

Transfer an existing RSA private key to a new device — server never sees it.

```
Device A (has keys)      Server          Device B (new)
  │── create session ──▶ │                    │
  │◀── sessionId ─────── │                    │
  │  [shows QR code]     │◀── scan + claim ───│
  │◀── device-link-claimed (socket) ──────────│
  │  ECDH derive AES     │                    │
  │  Encrypt RSA priv    │                    │
  │── PUT transfer ──────▶── device-link-ready▶│
  │                      │◀── GET session ─────│
  │                      │   ECDH derive AES   │
  │                      │   Decrypt + import  │
```

---

## Messaging Flows

### 1:1 with delivery + read receipts

```
Sender ──▶ API (save) ──▶ Receiver online? ──Yes──▶ socket new-message
                               │                        │
                               No                   confirm-delivery
                               │                        │
                          FCM push to device    Sender ◀── message-delivered
                          (if FCM token set)
```

### Offline message cache (Flutter)

```
Open chat screen
    │
    ▼
Load from Hive cache ──▶ Show messages instantly (no spinner)
    │
    ▼ (in parallel)
Fetch from API ──▶ Decrypt ──▶ Update UI ──▶ Save to Hive
```

---

## Mobile Screens — Full Walkthrough

The Flutter app has **14 screens**. All shown below in mobile phone frames.

---

### Screen 1 — Login

```
  ╔══════════════════════╗
  ║  9:41          ▐▌ ▓  ║
  ╠══════════════════════╣
  ║                      ║
  ║      ┌─────────┐     ║
  ║      │    R    │     ║  ← Reon logo (violet–cyan gradient)
  ║      └─────────┘     ║
  ║                      ║
  ║    Welcome back      ║
  ║   Sign in to         ║
  ║      continue        ║
  ║                      ║
  ║  ┌──────────────────┐║
  ║  │ ✉  Email         │║
  ║  └──────────────────┘║
  ║  ┌──────────────────┐║
  ║  │ 🔒 Password    👁 │║
  ║  └──────────────────┘║
  ║                      ║
  ║  ╔══════════════════╗ ║
  ║  ║     Sign In      ║ ║
  ║  ╚══════════════════╝ ║
  ║  ────── or ──────     ║
  ║  ┌──────────────────┐║
  ║  │ G  Continue with │║
  ║  │    Google        │║  ← Google Sign-In
  ║  └──────────────────┘║
  ║  Don't have an       ║
  ║  account?  Sign Up   ║
  ║                      ║
  ╚══════════════════════╝
```

---

### Screen 2 — Sign Up

```
  ╔══════════════════════╗
  ║  9:41          ▐▌ ▓  ║
  ╠══════════════════════╣
  ║      ┌─────────┐     ║
  ║      │    R    │     ║
  ║      └─────────┘     ║
  ║    Create account    ║
  ║  ┌──────────────────┐║
  ║  │ 👤  Full Name    │║
  ║  └──────────────────┘║
  ║  ┌──────────────────┐║
  ║  │ ✉   Email        │║
  ║  └──────────────────┘║
  ║  ┌──────────────────┐║
  ║  │ 🔒  Password   👁 │║
  ║  └──────────────────┘║
  ║  ╔══════════════════╗ ║
  ║  ║   Create Account ║ ║
  ║  ╚══════════════════╝ ║
  ║  ────── or ──────     ║
  ║  ┌──────────────────┐║
  ║  │ G  Continue with │║
  ║  │    Google        │║  ← Google Sign-In
  ║  └──────────────────┘║
  ║  Already have an     ║
  ║  account?  Sign In   ║
  ╚══════════════════════╝
```

---

### Screen 3 — Onboarding

```
  ╔══════════════════════╗
  ║  9:41          ▐▌ ▓  ║
  ╠══════════════════════╣
  ║   Set up your        ║
  ║      profile         ║
  ║       ┌───────┐      ║
  ║       │  👤   │      ║  ← tap to pick from gallery
  ║       └───────┘      ║
  ║    Tap to add photo  ║
  ║  ┌──────────────────┐║
  ║  │ Bio (optional)   │║
  ║  └──────────────────┘║
  ║  ┌──────────────────┐║
  ║  │ Location         │║
  ║  └──────────────────┘║
  ║  ╔══════════════════╗ ║
  ║  ║   Get Started    ║ ║  ← RSA keypair generated here
  ║  ╚══════════════════╝ ║
  ╚══════════════════════╝
```

---

### Screen 4 — Home (Navigation Shell)

```
  ╔══════════════════════╗
  ║  [current tab content]║
  ║                      ║
  ╠══════════════════════╣
  ║  💬   👥²  🔭  🔔³  ⚙️ ║
  ║Chats Friends Disc    ║
  ║            Alerts Settings
  ╚══════════════════════╝
```

Badge on Friends = pending requests. Badge on Alerts = unread notifications.

---

### Screen 5 — Chat List

```
  ╔══════════════════════╗
  ║  Reon              🔍 ║
  ║──────────────────────║
  ║  [Chats] │  Groups   ║
  ║──────────────────────║
  ║  ┌────────────────┐  ║
  ║  │ 👤 Alice    🟢 │  ║  ← online dot
  ║  │ Hey, how are   │  ║
  ║  │           3:41 │  ║
  ║  └────────────────┘  ║
  ║  ┌────────────────┐  ║
  ║  │ 👤 Bob         │  ║
  ║  │ You: sounds good│  ║
  ║  │     Yesterday  │  ║
  ║  └────────────────┘  ║
  ║  ┌────────────────┐  ║
  ║  │ 👥 Dev Team    │  ║  ← group
  ║  │ Alice: Merged! │  ║
  ║  │           2:15 │  ║
  ║  └────────────────┘  ║
  ╚══════════════════════╝
```

---

### Screen 6 — Direct Message Chat

```
  ╔══════════════════════╗
  ║ ←  👤 Alice    🟢    ║
  ║    Online            ║
  ╠══════════════════════╣
  ║ · · · · · · · · · ·  ║  ← dot-grid background
  ║              ┌─────┐ ║
  ║              │ Hey! │ ║  ← my bubble (gradient, right)
  ║              │  ✓✓  │ ║  ← read ticks (blue)
  ║              └─────┘ ║
  ║  ┌────────┐          ║
  ║  │ Hi :)  │          ║  ← their bubble (card, left)
  ║  └────────┘          ║
  ║  ● ● ●               ║  ← typing animation
  ╠══════════════════════╣
  ║  ┌────────────────┐ ➤║
  ║  │  Message…      │  ║
  ║  └────────────────┘  ║
  ╚══════════════════════╝
```

Messages load from **Hive cache instantly** before network responds.  
Status ticks: sending → sent → delivered → read.

---

### Screen 7 — Group Chat

```
  ╔══════════════════════╗
  ║ ←  👥 Dev Team       ║
  ║    4 members         ║
  ╠══════════════════════╣
  ║  ┌────────────────┐  ║
  ║  │ Alice          │  ║  ← sender name
  ║  │ PR is merged!  │  ║
  ║  └────────────────┘  ║
  ║              ┌──────┐║
  ║              │ Nice!│ ║
  ║              │ 3/4✓ │ ║  ← delivered to 3 of 4
  ║              └──────┘║
  ╠══════════════════════╣
  ║  ┌────────────────┐ ➤║
  ║  │  Message…      │  ║
  ║  └────────────────┘  ║
  ╚══════════════════════╝
```

---

### Screen 8 — Friends

```
  ╔══════════════════════╗
  ║  Friends             ║
  ║──────────────────────║
  ║  [Friends] │ Requests║
  ║──────────────────────║
  ║  ┌────────────────┐  ║
  ║  │ 👤 Alice  🟢   │  ║
  ║  │ [Message] [Remove]║
  ║  └────────────────┘  ║
  ║  ── Requests tab ──  ║
  ║  ┌────────────────┐  ║
  ║  │ 👤 Carol       │  ║
  ║  │[Accept] [Reject]  ║
  ║  └────────────────┘  ║
  ║  ┌────────────────┐  ║
  ║  │ 👤 Dan         │  ║
  ║  │   [Withdraw]   │  ║  ← sent by me
  ║  └────────────────┘  ║
  ╚══════════════════════╝
```

---

### Screen 9 — Discover

```
  ╔══════════════════════╗
  ║  Discover            ║
  ║──────────────────────║
  ║  ┌────────────────┐  ║
  ║  │   👤 Eve       │  ║
  ║  │  "Designer"    │  ║
  ║  │   London       │  ║
  ║  │    [Add →]     │  ║
  ║  └────────────────┘  ║
  ║  ┌────────────────┐  ║
  ║  │   👤 Frank     │  ║
  ║  │   [Withdraw]   │  ║
  ║  └────────────────┘  ║
  ║  ┌────────────────┐  ║
  ║  │   👤 Grace     │  ║
  ║  │[Accept] [Reject]  ║
  ║  └────────────────┘  ║
  ╚══════════════════════╝
```

---

### Screen 10 — Notifications (Alerts)

```
  ╔══════════════════════╗
  ║  Alerts      [✓ All] ║
  ║──────────────────────║
  ║  ┌────────────────┐  ║
  ║  │ 🔵 Alice sent  │  ║  ← blue dot = unread
  ║  │    a request   │  ║
  ║  │    2 min ago   │  ║
  ║  └────────────────┘  ║
  ║  ┌────────────────┐  ║
  ║  │    Bob accepted│  ║  ← no dot = already read
  ║  │    1 hr ago    │  ║
  ║  └────────────────┘  ║
  ╚══════════════════════╝
```

---

### Screen 11 — Settings

```
  ╔══════════════════════╗
  ║  Settings            ║
  ╠══════════════════════╣
  ║      ┌─────────┐     ║
  ║      │   👤    │     ║  ← tap to change avatar
  ║      └─────────┘     ║
  ║  ┌──────────────────┐║
  ║  │  Full Name       │║
  ║  └──────────────────┘║
  ║  ┌──────────────────┐║
  ║  │  Bio…            │║
  ║  └──────────────────┘║
  ║  ╔══════════════════╗ ║
  ║  ║  Save Profile    ║ ║
  ║  ╚══════════════════╝ ║
  ║  Privacy             ║
  ║  Show last seen  [✓] ║
  ║  Show online     [✓] ║
  ║  ╔══════════════════╗ ║
  ║  ║  Link Device  📱 ║ ║
  ║  ╚══════════════════╝ ║
  ║  Change Password     ║
  ║  ╔══════════════════╗ ║
  ║  ║    Log Out       ║ ║  ← deletes FCM token + Hive cache
  ║  ╚══════════════════╝ ║
  ╚══════════════════════╝
```

---

### Screen 12 — Generate QR (Device A)

```
  ╔══════════════════════╗
  ║ ←  Link Device       ║
  ╠══════════════════════╣
  ║  Scan this QR from   ║
  ║  your new device     ║
  ║      ┌───────────┐   ║
  ║      │█▀▀▀▀▀▀▀▀█│   ║
  ║      │█ ███████ █│   ║  ← ECDH pub key + sessionId
  ║      │█ █     █ █│   ║
  ║      │█ ███████ █│   ║
  ║      └───────────┘   ║
  ║   Expires in 05:00   ║
  ╚══════════════════════╝
```

---

### Screen 13 — QR Scanner (Device B)

```
  ╔══════════════════════╗
  ║ ←  Link Device       ║
  ╠══════════════════════╣
  ║  Point camera at     ║
  ║  the QR on your      ║
  ║  other device        ║
  ║  ┌────────────────┐  ║
  ║  │  [live camera] │  ║
  ║  │   ┌────────┐   │  ║  ← animated scan overlay
  ║  │   └────────┘   │  ║
  ║  └────────────────┘  ║
  ║   Waiting for scan…  ║
  ╚══════════════════════╝
```

---

### Screen 14 — Link This Device Gate

Shown instead of HomeScreen when a user logs in on an unlinked device (server has their public key but this device has no private key).

```
  ╔══════════════════════╗
  ║  9:41          ▐▌ ▓  ║
  ╠══════════════════════╣
  ║                      ║
  ║         🔒           ║  ← lock icon (teal)
  ║                      ║
  ║   Link This Device   ║
  ║                      ║
  ║  Your encryption     ║
  ║  keys are stored on  ║
  ║  your original       ║
  ║  device.             ║
  ║                      ║
  ║  On your original    ║
  ║  device: go to       ║
  ║  Settings → Link     ║
  ║  New Device.         ║
  ║                      ║
  ║  ╔══════════════════╗ ║
  ║  ║ [QR] Scan QR to  ║ ║  ← opens LinkDeviceScreen
  ║  ║   Link           ║ ║
  ║  ╚══════════════════╝ ║
  ║                      ║
  ║      Log Out         ║  ← returns to LoginScreen
  ╚══════════════════════╝
```

Generating a new key pair here is intentionally blocked — doing so would upload a new public key to the server, making all existing encrypted messages unreadable.

---

### Screen navigation map

```
           LoginScreen ──────────── SignupScreen
                │                       │
          (email/password            (email/password
           or Google)                 or Google)
                │
          OnboardingScreen (first login)
                │
          needsDeviceLink?
                ├── Yes ──▶  _DeviceLinkGateScreen
                │                   │
                │            LinkDeviceScreen
                │            (scan QR from original device)
                │                   │ (success)
                └── No ─────────────▼
                              HomeScreen (IndexedStack)
                              │    │    │    │    │
                         tab0 │ tab1│ tab2│ tab3│ tab4│
                              │    │    │    │    │
                         ChatList  │  Discover │  Settings
                              │  Friends   │       │
                              │    │    Notifications│
                         ┌────┘    │          SettingsLinkDeviceScreen
                         │         │                 │
                     ChatScreen  (Friends/Discover  LinkDeviceScreen
                 GroupChatScreen  push to ChatScreen)
```

---

## Web Routes

| Route | Description |
|-------|-------------|
| `/login` | Email/password + Google OAuth |
| `/signup` | Registration |
| `/onboarding` | Profile + RSA key generation |
| `/chat` | Chat list (DMs + Groups) |
| `/chat/[userId]` | 1:1 conversation |
| `/group/[groupId]` | Group chat |
| `/friends` | Friends + requests |
| `/recommendations` | Discover people |
| `/notifications` | Notification centre |
| `/settings` | Profile, privacy, password |
| `/settings/link-device` | Generate QR (Device A) |
| `/link-device` | Scan QR (Device B) |

---

## REST API Reference

### Messages — `/api/messages`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/send` | Send 1:1 message (multipart) |
| GET | `/:receiverId` | Paginated message history |
| GET | `/sidebar/list` | Last message per conversation |
| GET | `/search?q=` | Search users |
| PUT | `/chat/read/:userId` | Mark conversation read |
| GET | `/:messageId/info` | Delivery/read metadata |
| GET | `/media/:id` | Serve encrypted media |
| GET | `/download/:id` | Download encrypted file |

### Groups — `/api/groups`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Create group |
| GET | `/` | List user's groups |
| GET | `/:groupId` | Group details |
| PUT | `/:groupId` | Update name/description |
| POST | `/:groupId/members` | Add members |
| DELETE | `/:groupId/members/:memberId` | Remove member |
| PATCH | `/:groupId/admins/:memberId` | Promote to admin |
| POST | `/:groupId/messages` | Send group message |
| GET | `/:groupId/messages` | Paginated group messages |
| PUT | `/:groupId/read` | Mark group read |

### Friends — `/api/users`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/recommendation` | Discover users |
| GET | `/friends` | Friend list |
| PATCH | `/friends/:id` | Remove friend |
| POST | `/friend-request/:id` | Send request |
| POST | `/friend-request/:id/accept` | Accept |
| POST | `/friend-request/:id/withdraw` | Withdraw |
| DELETE | `/friend-request/:id` | Reject |
| GET | `/friend-requests/received` | Incoming |
| GET | `/friend-requests/sent` | Outgoing |
| GET | `/friend-request/pending-count` | Badge count |

### Keys — `/api/keys`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/uploadPublicKey` | Upload RSA public JWK |
| GET | `/publicKey/:userId` | Fetch public key |
| POST | `/link-session/create` | Start device-link |
| PUT | `/link-session/:id/claim` | New device claims |
| PUT | `/link-session/:id/transfer` | Upload encrypted key |
| GET | `/link-session/:id` | Poll session status |

### Settings — `/api/settings`

| Method | Path | Description |
|--------|------|-------------|
| PUT | `/profile` | Update name, bio, location, avatar |
| PUT | `/change-password` | Change password |
| PATCH | `/privacy` | Privacy toggles |
| PUT | `/fcm-token` | Save FCM push token |

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
| `heartbeat` | — | Keep-alive (every 12s) |
| `start-typing` | `{ senderId, receiverId, isTyping }` | Typing indicator |
| `stop-typing` | `{ senderId, receiverId }` | Stop typing |
| `message-read` | `{ messageId, senderId }` | Read receipt |
| `confirm-message-delivery` | `{ messageId, senderId }` | Delivery ack |
| `join-groups` | — | Join all group rooms |
| `group-typing-start` | `{ groupId }` | Group typing |
| `group-message-delivered` | `{ messageId, groupId }` | Group delivery ack |

### Server → Client

| Event | Description |
|-------|-------------|
| `authenticated` | Auth OK + online friends list |
| `user-status-changed` | Friend online/offline |
| `user-typing` | DM typing indicator |
| `new-message` | Incoming 1:1 message |
| `message-sent` | Send confirmed |
| `message-delivered` | Delivered to recipient |
| `messages-delivered-batch` | Batch delivery update |
| `message-read` | Read by recipient |
| `new-group-message` | Incoming group message |
| `group-message-delivered` | Group delivery receipt |
| `group-messages-read` | Group read receipts |
| `friend-request-received` | Incoming request |
| `friend-request-accepted-realtime` | Request accepted |
| `friend-request-rejected` | Request rejected |
| `pending-requests-count-updated` | Badge count update |
| `device-link-claimed` | Device B claimed session |
| `device-link-ready` | Encrypted key ready |

---

## Environment Variables

### Backend (`backend/.env`)

```env
PORT=5001
NODE_ENV=development
MONGO_URI=mongodb+srv://...
JWT_SECRET=your_long_random_secret
FRONTEND_URL=http://localhost:3000

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Google OAuth (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Firebase — ONE of these two (see Firebase Setup section)
FIREBASE_SERVICE_ACCOUNT=/path/to/serviceAccount.json
# OR
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

### Web (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:5001/api
NEXT_PUBLIC_SOCKET_URL=http://localhost:5001
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### Mobile (`flutter_app/lib/config.dart`)

```dart
const String kApiBase    = 'http://10.0.2.2:5001/api';  // emulator
const String kSocketUrl  = 'http://10.0.2.2:5001';
const String kSiteUrl    = 'http://localhost:3000';
```

---

## Flutter Setup & Build APK

### Step 1 — Install JDK 17

Download from **https://adoptium.net** → choose Temurin 17 LTS → run installer.

```powershell
java -version   # expected: openjdk version "17.x.x"
```

### Step 2 — Install Android Studio

Download from **https://developer.android.com/studio** → run the Setup Wizard (installs SDK automatically).

Then open **SDK Manager → SDK Tools** and install:
- Android SDK Command-line Tools
- NDK (Side by side)

### Step 3 — Install Flutter SDK

1. Download from **https://docs.flutter.dev/get-started/install/windows**
2. Extract to `C:\flutter`
3. Add `C:\flutter\bin` to your PATH (System → Environment Variables → User `Path` → New)
4. Verify: `flutter --version`

### Step 4 — Accept licenses & verify

```powershell
flutter doctor --android-licenses   # press Y for each prompt
flutter doctor -v                   # all items must show [✓]
```

### Step 5 — Get dependencies

```powershell
cd flutter_app
flutter pub get
```

### Step 6 — Configure backend URL

Edit [lib/config.dart](flutter_app/lib/config.dart):

```dart
const String kApiBase   = 'http://10.0.2.2:5001/api';   // Android emulator
// const String kApiBase = 'http://192.168.1.100:5001/api'; // physical phone (your LAN IP)
// const String kApiBase = 'https://api.yourdomain.com/api'; // production
```

### Step 7 — Run tests

```powershell
flutter test
```

### Step 8 — Build APK

```powershell
# Debug (quick test)
flutter build apk --debug
# Output: build\app\outputs\flutter-apk\app-debug.apk

# Release (signed — see signing steps below)
flutter build apk --release

# Split by architecture (smaller files — use arm64 for modern phones)
flutter build apk --split-per-abi --release
```

### Signing a release APK

#### Create keystore (one-time)

```powershell
keytool -genkey -v -keystore reon-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias reon
```

Move `reon-release.jks` to `flutter_app/android/app/`.

#### Create `android/key.properties`

```properties
storePassword=YOUR_STORE_PASSWORD
keyPassword=YOUR_KEY_PASSWORD
keyAlias=reon
storeFile=reon-release.jks
```

Add `android/key.properties` to `.gitignore`.

#### Update `android/app/build.gradle`

```gradle
def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file('key.properties')
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    signingConfigs {
        release {
            keyAlias     keystoreProperties['keyAlias']
            keyPassword  keystoreProperties['keyPassword']
            storeFile    keystoreProperties['storeFile'] ? file(keystoreProperties['storeFile']) : null
            storePassword keystoreProperties['storePassword']
        }
    }
    buildTypes {
        release { signingConfig signingConfigs.release }
    }
}
```

### Install on a physical phone

1. Enable **Developer Options** → **USB Debugging** on your phone
2. Connect via USB, accept the prompt
3. Run: `flutter install`

---

## Firebase Push Notifications Setup

Push notifications are **optional** — the app works fully without them. Notifications only fire when the recipient is offline.

### Step 1 — Create a Firebase project

1. Go to **https://console.firebase.google.com**
2. Click **Add project** → follow the wizard

### Step 2 — Add Android app to Firebase

1. In the Firebase console, click **Add app → Android**
2. Package name: `com.example.reon` (match your `android/app/build.gradle`)
3. Download `google-services.json`
4. Place it at `flutter_app/android/app/google-services.json`

### Step 3 — Enable Firebase in the Android build

In `flutter_app/android/build.gradle` (project-level), add:
```gradle
dependencies {
    classpath 'com.google.gms:google-services:4.4.1'
}
```

In `flutter_app/android/app/build.gradle`, add at the bottom:
```gradle
apply plugin: 'com.google.gms.google-services'
```

### Step 4 — Get the server service account key

1. Firebase Console → Project Settings → **Service Accounts**
2. Click **Generate new private key** → download the JSON file
3. Set on your backend:

```env
# Option A — file path
FIREBASE_SERVICE_ACCOUNT=/path/to/serviceAccount.json

# Option B — raw JSON string (better for cloud hosts)
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}
```

### Step 5 — Install Firebase Admin SDK on backend

```bash
cd backend
npm install firebase-admin
```

That's it — the backend's `lib/fcm.js` handles everything else automatically.

---

## CI/CD

Three GitHub Actions workflows run automatically on every push:

| Workflow | Trigger | What it does |
|----------|---------|-------------|
| [backend.yml](.github/workflows/backend.yml) | Push to `backend/**` | Installs deps, runs all Jest tests with `mongodb-memory-server` |
| [flutter.yml](.github/workflows/flutter.yml) | Push to `flutter_app/**` | `flutter analyze --no-fatal-infos`, `flutter test --coverage`, builds debug APK (artifact uploaded); pinned to Flutter 3.32.2 |
| [frontend.yml](.github/workflows/frontend.yml) | Push to `frontend/**` | Lint, TypeScript type-check, `next build` |

All workflows use caching for faster runs. The Flutter workflow also uploads the built APK as a downloadable artifact on every successful run.

---

## Backend & Web Setup

### Prerequisites
- Node.js 18+, MongoDB (local or Atlas), Cloudinary account

### Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in values
npm run dev            # port 5001
```

### Run tests

```bash
cd backend
NODE_OPTIONS=--experimental-vm-modules npx jest
NODE_OPTIONS=--experimental-vm-modules npx jest --coverage   # with coverage
```

### Web frontend

```bash
cd frontend
npm install
# create .env.local with NEXT_PUBLIC_* vars
npm run dev            # http://localhost:3000
```

---

## Deployment Notes

| Service | Host | Notes |
|---------|------|-------|
| Backend | Render / Railway / Fly.io | Set `FRONTEND_URL`, `FIREBASE_SERVICE_ACCOUNT_JSON` |
| Web | Vercel | Set `NEXT_PUBLIC_*` env vars |
| MongoDB | MongoDB Atlas | Free tier fine for dev |
| Cloudinary | cloudinary.com | Profile pictures CDN |
| FCM | Firebase (free) | Required for push notifications |
| Mobile | Google Play / sideload | Update `config.dart` to production URL |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `flutter: command not found` | Add `C:\flutter\bin` to PATH, restart terminal |
| `cmdline-tools component is missing` | SDK Manager → SDK Tools → Android SDK Command-line Tools |
| `License not accepted` | `flutter doctor --android-licenses` |
| `Gradle JAVA_HOME error` | Set `JAVA_HOME` to JDK 17 path in environment variables |
| `keytool not found` | Add JDK `bin` folder to PATH |
| App crashes on launch | Verify `config.dart` URLs point to running backend |
| `[decryption failed]` in messages | Log out and back in to regenerate keys |
| Camera crash / NPE on Android (`null object reference` from `mobile_scanner`) | Camera permission must be granted before the `MobileScanner` widget mounts. The scanner uses `autoStart: false` and starts only in a second `addPostFrameCallback` after permission is confirmed. If the crash recurs, go to Settings → Apps → Reon → Permissions and grant Camera manually. |
| QR scan not working | Grant Camera permission: Settings → Apps → Reon → Permissions |
| "Link This Device" gate shown after login | You are on a new/unlinked device. Your private key lives on your original device. Go to your original device: Settings → Link New Device → show the QR. Then tap "Scan QR Code to Link" on this screen. **Do not log out and back in hoping it clears** — a new key pair would be generated and all existing encrypted messages would become unreadable. |
| Push notifications not received | Check `google-services.json` is in `android/app/`; verify `FIREBASE_SERVICE_ACCOUNT_JSON` on backend |
| Socket not connecting | Check backend is running on port 5001; check firewall |
| `MissingPluginException` | `flutter clean && flutter pub get` then rebuild |
| Backend tests fail | Ensure `mongodb-memory-server` is installed: `npm install` in `backend/` |
| `flutter analyze` exits with code 1 | Run `flutter analyze --no-fatal-infos` — infos are suppressed; only warnings are build-breaking. Fix any remaining warnings before pushing. |

---

*Built with Flutter · Encrypted with PointyCastle · Real-time with Socket.IO · Tested with Jest*
