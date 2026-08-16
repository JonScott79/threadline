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
| Facebook Messenger (`.json`) | PLANNED |
| WhatsApp Export (`.txt`/`.zip`) | PLANNED |
| Signal Export | PLANNED |
| Email (`.eml`/`.msg`) | PLANNED |
| PDF Documents | PLANNED |

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

### Railway Persistence Warning
If deploying to Railway, be aware that Railway's default filesystem is **ephemeral**. 
The SQLite database (`backend/database/threadline.db`) and uploaded files are stored locally on the container's disk. 
**You MUST provision a Railway Volume** and mount it to the database directory, otherwise all data will be destroyed every time the backend service restarts or redeploys.

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
