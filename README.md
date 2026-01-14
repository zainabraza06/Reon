# Reon - Secure Communication Platform

A full-stack real-time communication application with end-to-end encryption, voice/video calling, and comprehensive friend management features.

## Features

### Core Communication
- **Real-time Messaging**: Instant text-based communication with WebSocket support
- **Voice & Video Calls**: High-quality peer-to-peer calling using WebRTC
- **Voice Recording**: Record and share voice messages with friends
- **Media Support**: Share images, videos, and other media files

### Security & Privacy
- **End-to-End Encryption (E2E)**: Military-grade encryption for all messages and calls
- **Public Key Exchange**: Secure key distribution using public key cryptography
- **Encrypted Storage**: Secure storage of sensitive data

### Social Features
- **Friend Request System**: Send, receive, and manage friend requests
- **Friend Management**: Add, remove, and block users
- **User Recommendations**: Discover new users to connect with
- **Notifications**: Real-time notifications for all activities

### Performance & Storage
- **Redis Caching**: Optimized performance with intelligent caching
- **GridFS**: Efficient handling of large media files
- **Cloudinary Integration**: Cloud-based profile picture storage
- **TURN Server**: Reliable WebRTC connectivity

## Tech Stack

### Frontend
- **Framework**: Next.js 14+ with TypeScript
- **Styling**:  CSS Modules
- **Real-time**: Socket.io client
- **State Management**: React Context API
- **WebRTC**: For voice and video calls

### Backend
- **Runtime**: Node.js with Express.js
- **Database**: MongoDB
- **Authentication**: Passport.js with JWT
- **Real-time**: Socket.io
- **File Storage**: GridFS (MongoDB) & Cloudinary
- **Caching**: Redis
- **Email**: Node Mailer for email verification

### Infrastructure
- **WebRTC**: TURN servers for NAT traversal
- **Encryption**: Crypto module for E2E encryption

## Installation & Setup

### Prerequisites
- Node.js 16+
- MongoDB
- Redis
- Cloudinary account
- TURN server credentials

### Backend Setup

```bash
cd backend
npm install

# Create .env file with the following:
MONGODB_URI=your_mongodb_uri
JWT_SECRET=your_jwt_secret
CLOUDINARY_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
REDIS_URL=your_redis_url
TURN_SERVER=your_turn_server
TURN_USERNAME=your_turn_username
TURN_PASSWORD=your_turn_password
SMTP_USER=your_email
SMTP_PASSWORD=your_email_password

npm start
```

### Frontend Setup

```bash
cd frontend
npm install

# Create .env.local file with:
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_SOCKET_URL=http://localhost:5000

npm run dev
```

## Project Structure

```
connectify-app/
├── backend/
│   ├── src/
│   │   ├── controllers/      # Route controllers
│   │   ├── models/          # MongoDB models
│   │   ├── routes/          # API routes
│   │   ├── middlewares/      # Express middlewares
│   │   ├── lib/             # Utilities (Socket, DB, Cloudinary)
│   │   └── utils/           # Helper functions (Crypto, Email, etc.)
│   └── server.js            # Entry point
│
└── frontend/
    ├── app/                 # Next.js pages
    ├── components/          # React components
    ├── context/            # Context providers (Auth, Call, Notification)
    ├── hooks/              # Custom hooks (useWebRTC, useFriendRequest, etc.)
    ├── lib/                # Utilities (API client, WebRTC, Crypto)
    ├── types/              # TypeScript type definitions
    └── public/             # Static assets
```

## Key Features Explained

### End-to-End Encryption (E2E)

All messages and calls are encrypted using military-grade cryptography with a hybrid encryption approach ensuring only intended recipients can decrypt content.

#### Encryption Architecture

**Hybrid Encryption System:**
- **RSA-2048**: Asymmetric encryption for key exchange and initial key distribution
- **AES-256-GCM**: Symmetric encryption for high-speed message and file encryption
- **SHA-256**: Hashing algorithm for key derivation

#### Implementation Details

**1. Key Management**
- Each user generates an RSA-2048 key pair on first login
- Private keys are securely stored in browser's IndexedDB
- Public keys are stored on the server for key exchange
- Key pairs are generated using Web Crypto API's `crypto.subtle.generateKey()`

**2. Text Message Encryption**
- Messages are encrypted using RSA-OAEP with SHA-256
- Algorithm: `crypto.subtle.encrypt()` with RSA-OAEP parameters
- Encrypted messages are Base64 encoded for safe transmission
- Decryption requires recipient's private key (only available client-side)

**3. File Encryption**
- Each file gets a unique AES-256 key
- Files are encrypted with AES-GCM using a random 12-byte IV
- The AES key is then encrypted separately for both sender and recipient using their RSA public keys
- This allows both parties to access the encrypted file and decrypt it independently

**File Encryption Flow:**
```
1. Generate unique AES-256 key for file
2. Read file into buffer
3. Generate random IV (12 bytes)
4. Encrypt file data with AES-GCM + IV
5. Export AES key to raw format
6. Encrypt raw AES key for recipient (RSA-OAEP)
7. Encrypt raw AES key for sender (RSA-OAEP)
8. Send encrypted file + encrypted keys + IV to server
```

**File Decryption Flow:**
```
1. Fetch encrypted file from server
2. Retrieve stored RSA private key from IndexedDB
3. Decrypt recipient's AES key using RSA private key
4. Retrieve IV from response headers (X-Encryption-IV)
5. Decrypt file data using AES-GCM + IV + AES key
6. Create blob and allow user to download
```

**4. Call Encryption**
- Voice and video data are encrypted using DTLS-SRTP
- WebRTC automatically handles encryption at the media transport layer
- Additional E2E encryption layer for call metadata and signaling

#### Security Features

| Feature | Description |
|---------|-------------|
| **IndexedDB Storage** | Private keys never leave the browser; stored in encrypted IndexedDB |
| **Random IVs** | Each encryption uses a unique cryptographically random IV (12 bytes) |
| **Authenticated Encryption** | AES-GCM provides both confidentiality and authenticity |
| **Perfect Forward Secrecy** | Ephemeral keys for each message/file prevent past data exposure |
| **Key Isolation** | Each file/message can have independent encryption keys |
| **Client-side Processing** | All encryption/decryption happens on client; server never sees plaintext |

#### Crypto Functions Reference

**Key Management:**
- `generateRSAKeys(userId)` - Generate and store RSA-2048 key pair
- `ensureRSAKeys(userId)` - Retrieve existing or generate new keys
- `saveKeyPair(userId, keyPair)` - Store key pair in IndexedDB
- `getKeyPair(userId)` - Retrieve key pair from IndexedDB

**Text Encryption:**
- `encryptTextMessage(message, publicKey)` - Encrypt text with RSA-OAEP
- `decryptTextMessage(encrypted, privateKey)` - Decrypt RSA-OAEP encrypted text
- `encryptWithAES(aesKey, plaintext)` - Encrypt with AES-256-GCM
- `decryptWithAES(aesKey, ciphertext)` - Decrypt AES-256-GCM encrypted text

**File Encryption:**
- `encryptFileForRecipient(file, recipientPublicKey, senderPublicKey)` - Full file encryption workflow
- `decryptFile(encryptedFileUrl, encryptedAESKeyHex, userId)` - Full file decryption workflow
- `downloadDecryptedFile(...)` - Decrypt and download file to user device
- `encryptAESKeyForRecipient(aesKey, recipientPublicKey)` - Encrypt AES key with RSA

**Utility Functions:**
- `generateAESKey()` - Generate random AES-256 key
- `aesKeyToString(key)` - Serialize AES key to Base64
- `stringToAESKey(str)` - Deserialize AES key from Base64
- `bufferToHex(buffer)` - Convert ArrayBuffer to hex string
- `hexToArrayBuffer(hex)` - Convert hex string to ArrayBuffer
- `getMimeTypeFromFilename(filename)` - Detect MIME type from file extension

#### Performance Considerations

- Encryption operations are CPU-intensive but run client-side
- Use Web Workers for large file encryption to prevent UI blocking
- Browser caching of encrypted files reduces redundant decryption
- IV and metadata sent separately from encrypted data for efficient streaming
- RSA operations (slower) only used for key exchange; AES used for bulk data

### WebRTC Calling
Voice and video calls are established directly between peers using WebRTC, with a TURN server ensuring connectivity through NAT and firewalls.

### Real-time Updates
Socket.io enables real-time communication including live call notifications, typing indicators, and instant message delivery.

### File Management
- **Profile Pictures**: Stored on Cloudinary for optimized delivery
- **Media Files**: Large files are stored using GridFS in MongoDB
- **Caching**: Redis caches frequently accessed data for improved performance

### Friend System
- Send and receive friend requests
- Accept or decline requests
- View friend list and get recommendations

## API Endpoints

### Authentication
- `POST /auth/signup` - Register new user
- `POST /auth/login` - Login user
- `POST /auth/verify-email` - Verify email
- `POST /auth/reset-password` - Password reset

### Messages
- `GET /message/:conversationId` - Fetch messages
- `POST /message/send` - Send message
- `DELETE /message/:messageId` - Delete message

### Calls
- `POST /call/initiate` - Initiate a call
- `POST /call/end` - End a call
- `GET /call/history` - Get call history

### Friends
- `POST /friend/request` - Send friend request
- `GET /friend/requests` - Get pending requests
- `POST /friend/accept` - Accept request
- `GET /friend/list` - Get friends list

### Settings
- `PUT /settings/profile` - Update profile
- `PUT /settings/privacy` - Update privacy settings
- `GET /settings/notifications` - Get notification settings

## Development

### Running Tests
```bash
npm test
```

### Building for Production
```bash
# Frontend
cd frontend
npm run build
npm start

# Backend
cd backend
npm start
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request



## Performance Optimization

- Redis caching reduces database queries
- GridFS efficiently handles large files
- WebRTC provides low-latency direct communication
- TURN servers ensure reliable connectivity globally



## Support

For issues and questions, please open an issue on GitHub.

## Acknowledgments

- WebRTC for peer-to-peer communication
- Socket.io for real-time features
- MongoDB for flexible data storage
- Cloudinary for image optimization
- Redis for caching layer
