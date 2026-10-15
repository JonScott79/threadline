# THREADLINE

**Threadline** is a local-first communication analysis platform. It processes exported communication data (such as SMS XML and HTML chat logs), normalizes them into a unified format, and presents them as a searchable, chronological timeline.

It is designed with privacy and professional workflows in mind: your data stays on your machine and is stored in a local SQLite database.

## Architecture

Threadline operates as a **Monolithic Node.js/React Application**:

- **Frontend:** React (Vite)
- **Backend:** Node.js (Express)
- **Database:** SQLite (`better-sqlite3`)
- **Parsers:** Native Node.js parsers
- **Authentication:** Firebase Auth (Client-side only)

*(Note: An experimental C++ engine repository exists separately at `JonScott79/threadline-engine`, but it is currently disconnected and not utilized by this web application.)*

## Supported Formats

| Format | Status |
|--------|--------|
| SMS Backup & Restore (`.xml`) | **IMPLEMENTED** |
| HTML Conversation Export (`.html`) | **IMPLEMENTED** |
| Communication Logs (`.log`, `.txt`) | **IMPLEMENTED** |
| Facebook Messenger (`.json`) | **IMPLEMENTED** |
| WhatsApp Export (`.txt`, `.zip`) | **IMPLEMENTED** |
| Signal Export (`.txt`, `.json`) | **IMPLEMENTED** |
| Email (`.eml`, `.mbox`) | **IMPLEMENTED** |
| PDF Documents (`.pdf`) | **IMPLEMENTED** |
| Screenshots / OCR (`.png`, `.jpg`, `.webp`) | **IMPLEMENTED** |
| Direct Paste Snippets (Text / Chat) | **IMPLEMENTED** |

## How to Run

### 1. Backend

```bash
cd backend
npm install
npm run dev
```

The Express server runs on `localhost:3001` and connects to `backend/database/threadline.db`.

### 2. Frontend

```bash
# In the root directory (website/)
npm install
npm run dev
```

The Vite dev server will typically run on `localhost:5174`.

## Deployment (Netlify & Railway)

Threadline can be deployed using a split architecture while maintaining its local-first behavior:

- **Frontend**: Hosted on Netlify (`https://threadline.lanzar.me`)
- **Backend**: Hosted on Railway (`https://threadline-production.up.railway.app`)

### Railway Persistent Storage Configuration
Threadline uses an attached Railway persistent volume for the SQLite database and durable user uploads so data persists across deployments and container restarts.

#### 1. Provision Persistent Volume
1. In the Railway dashboard for the `threadline` backend service, navigate to **Volumes**.
2. Click **+ Add Volume**.
3. Set the **Mount Path** to:
   `/data`

#### 2. Configure Environment Variables
In the service's **Variables** tab, set:
- `THREADLINE_DATA_DIR=/data`
- `NODE_ENV=production`

#### 3. Storage Paths & Safety Guards
- **Database Path**: `/data/threadline.db`
- **Uploads Path**: `/data/uploads`
- **Anti-Data Loss Guard**: In production (`NODE_ENV=production`), if the volume is detached or the database file is missing, the backend will fail loudly with a `[CRITICAL STORAGE ERROR]` rather than silently initializing an empty database. Set `ALLOW_EMPTY_DB=true` only if intentionally provisioning a fresh database.
- **Graceful Shutdown**: On container restarts, the backend intercepts `SIGTERM` and runs `PRAGMA wal_checkpoint(TRUNCATE)` before closing SQLite connections cleanly.

#### 4. Migration Script
To migrate or verify data on the persistent volume:
```bash
node scripts/migrateToPersistentVolume.js
```

### Frontend Configuration
When deploying the frontend to Netlify, you must set the following environment variable so the browser communicates with the public Railway domain:
`VITE_API_URL=https://threadline-production.up.railway.app/api`

**Do NOT** configure the frontend to use the private `threadline.railway.internal` domain, as this is only accessible within Railway's private network.

## Current Limitations & Known Issues

- **Local-First Only**: Despite having frontend login, there is currently no backend cryptographic token verification or cloud persistence. The application is strictly local.
- **Parser Coverage**: Only SMS XML and HTML tables are supported.
- **Port Sensitivity**: The backend strictly requires port `3001`. If another service is occupying it, the backend will fail to bind.

## Development

- `backend/` contains the Express API, SQLite integration, and parser logic.
- `src/` contains the React frontend.
- `docs/` contains legacy architecture and planning documents.

