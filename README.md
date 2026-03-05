# 👻 GhostChat

> Secure. Ephemeral. Anonymous. Messages disappear without a trace.

---

## Architecture at a glance

```
┌──────────────────────────────────────────────┐
│           Web Client (React + Vite)          │
│  WebCrypto X3DH • AES-256-GCM • IndexedDB   │
└────────────────────┬─────────────────────────┘
                     │  E2E Encrypted channel
          ┌──────────▼──────────┐
          │   Relay Server       │   ← DUMB: routes blobs, can't decrypt
          │   (Node.js + WS)     │
          └──────────┬──────────┘
                     │
          ┌──────────▼──────────┐
          │  Redis (temp queue)  │   ← Offline messages, max 30 days
          └─────────────────────┘

          ┌─────────────────────┐
          │  Key Server          │   ← Public keys ONLY (zero-knowledge)
          │  (Python + FastAPI)  │
          └─────────────────────┘
```

**Core principle:** The server is intentionally _dumb_ — it only routes opaque encrypted
packets. It cannot read content, sender identity, or metadata.

---

## Project structure

```
Ghost/
├── backend/               Node.js WebSocket relay server
│   ├── src/
│   │   ├── server.js
│   │   ├── handlers/
│   │   │   ├── relay.js       Message routing (never reads content)
│   │   │   ├── session.js     Live connection registry
│   │   │   └── queue.js       Offline message queue
│   │   ├── middleware/
│   │   │   └── validate.js    Packet schema validation
│   │   └── utils/
│   │       └── cleanup.js     Periodic queue eviction
│   └── tests/
│       └── relay.test.js
│
├── key-server/            Python FastAPI public-key store
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── models.py
│   │   ├── redis_client.py
│   │   └── routers/
│   │       └── keys.py        Register · Fetch · Upload OTKs · Delete
│   └── tests/
│       └── test_keys.py
│
├── web-client/            React + TypeScript + Vite
│   └── src/
│       ├── types/index.ts     Domain types & WS packet shapes
│       ├── utils/
│       │   ├── crypto.ts      X3DH · AES-256-GCM · PBKDF2 · b64
│       │   ├── storage.ts     Encrypted IndexedDB (PBKDF2 key)
│       │   └── wsClient.ts    WebSocket with auto-reconnect
│       ├── store/
│       │   ├── accountStore.ts  Anonymous account management
│       │   └── messageStore.ts  Ephemeral message lifecycle
│       ├── hooks/
│       │   └── useChat.ts     WS + encryption + expiry wiring
│       └── components/
│           ├── Auth/          Passphrase setup & unlock
│           ├── Chat/          ChatList · ChatWindow · MessageBubble · TimerSelector
│           └── Settings/      Account info · Self-destruct
│
├── shared/
│   └── schema.sql         Local SQLite schema (reference)
│
├── docker-compose.yml
└── .github/workflows/ci.yml
```

---

## Quick start

### Prerequisites

- Node.js ≥ 20, npm
- Python ≥ 3.12, pip
- Redis (or Docker)

### Option A – Docker Compose (recommended)

```bash
git clone <repo>
cd Ghost
docker compose up --build
```

| Service    | URL                          |
| ---------- | ---------------------------- |
| Web client | http://localhost:5173        |
| Relay WS   | ws://localhost:8080          |
| Key server | http://localhost:8000/docs   |
| Health     | http://localhost:3001/health |

### Option B – Manual

```bash
# 1. Redis
redis-server

# 2. Relay server
cd backend && cp .env.example .env && npm install && npm run dev

# 3. Key server
cd key-server && cp .env.example .env
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 4. Web client
cd web-client && npm install && npm run dev
```

---

## Security features

| Feature                    | Status | Implementation                                       |
| -------------------------- | ------ | ---------------------------------------------------- |
| E2E encryption (X3DH)      | ✅     | WebCrypto API — `crypto.ts`                          |
| AES-256-GCM messages       | ✅     | WebCrypto API — `encryptMessage()`                   |
| PBKDF2 storage key (600k)  | ✅     | `deriveStorageKey()` in `storage.ts`                 |
| Encrypted IndexedDB        | ✅     | All records encrypted before write                   |
| Zero-knowledge relay       | ✅     | Relay never decrypts — `relay.js`                    |
| Timed message deletion     | ✅     | `messageStore.ts` timers + `deleteExpiredMessages()` |
| Read-once messages         | ✅     | `markRead()` triggers immediate delete               |
| Burn-on-read (5s)          | ✅     | Scheduled 5-second delete after read                 |
| Screenshot notifications   | ✅     | `SCREENSHOT_ACK` WS packet                           |
| Self-destruct button       | ✅     | `nukeAllData()` wipes IndexedDB                      |
| Anonymous registration     | ✅     | UUID-based ID, no phone/email                        |
| One-time pre-keys (OTK)    | ✅     | Key server FIFO consumption                          |
| Signature verification     | ✅     | Ed25519 proof-of-possession                          |
| Auto-expire keys (30 days) | ✅     | Redis TTL in key server                              |
| Offline message queue      | ✅     | `queue.js` with expiry eviction                      |
| Metadata padding           | ✅     | `padSize()` + `roundedTimestamp()`                   |
| CI pipeline                | ✅     | GitHub Actions                                       |

---

## Running tests

```bash
# Relay server
cd backend && npm test

# Key server
cd key-server && pytest tests/ -v

# Web client
cd web-client && npm test
```

---

## Environment variables

### backend/.env

| Variable              | Default     | Description                       |
| --------------------- | ----------- | --------------------------------- |
| `PORT`                | `8080`      | WebSocket port                    |
| `HTTP_PORT`           | `3001`      | Health/metrics HTTP port          |
| `REDIS_HOST`          | `localhost` | Redis hostname                    |
| `MAX_QUEUE_DAYS`      | `30`        | Max days to hold offline messages |
| `CLEANUP_INTERVAL_MS` | `3600000`   | Queue cleanup frequency (ms)      |

### key-server/.env

| Variable            | Default   | Description                |
| ------------------- | --------- | -------------------------- |
| `KEY_TTL_SECONDS`   | `2592000` | Redis key expiry (30 days) |
| `MAX_ONE_TIME_KEYS` | `100`     | Max OTKs per user          |

---

## Roadmap

- [ ] libsignal-protocol Double Ratchet (replace simplified X3DH)
- [ ] Multi-device support (linked devices)
- [ ] Group encrypted chats
- [ ] Voice messages with auto-expiry
- [ ] Decoy mode (duress password)
- [ ] Tor/onion routing support
- [ ] iOS (Swift) + Android (Kotlin) native apps
- [ ] Reproducible builds + code signing

---

## License

MIT — use freely, contribute back, never compromise user privacy.
