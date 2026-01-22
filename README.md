# Realtime Collaborative Playlist Manager 
A realtime, multi‑window collaborative playlist app (think “Spotify collaborative playlist”, simplified). Multiple users can add, remove, reorder, and vote on songs in a shared playlist, and see updates across browser windows within ~1 second.

This repository implements the assignment using:

- **Frontend:** React (Vite) — JavaScript
- **Backend:** Node.js + Express — JavaScript
- **Database:** SQLite via Prisma ORM
- **Realtime:** Server‑Sent Events (SSE)

---

## Contents

1. [Tech Stack](#1-tech-stack)  
2. [Repository / Project Structure](#2-repository--project-structure)  
3. [Feature Matrix (What’s Included)](#3-feature-matrix-whats-included)  
4. [Architecture Overview](#4-architecture-overview)  
   4.1 [How Data Flows](#41-how-data-flows)  
   4.2 [Why SSE (not WebSocket)](#42-why-sse-not-websocket)  
5. [Data Model (Prisma + SQLite)](#5-data-model-prisma--sqlite)  
6. [Required Position Algorithm](#6-required-position-algorithm)  
7. [API Documentation](#7-api-documentation)  
8. [Realtime (SSE) Protocol](#8-realtime-sse-protocol)  
   8.1 [Heartbeat](#81-heartbeat)  
   8.2 [Event Types](#82-event-types)  
   8.3 [Dedup / Out-of-order Handling](#83-dedup--out-of-order-handling)  
9. [Offline Queue Behavior](#9-offline-queue-behavior)  
10. [UI/UX Notes + Keyboard Shortcuts](#10-uiux-notes--keyboard-shortcuts)  
11. [Setup + Run Locally (A → Z)](#11-setup--run-locally-a--z)  
   11.1 [Prerequisites](#111-prerequisites)  
   11.2 [Install Dependencies](#112-install-dependencies)  
   11.3 [Environment Variables](#113-environment-variables)  
   11.4 [Database Migration (Prisma)](#114-database-migration-prisma)  
   11.5 [Seed Data](#115-seed-data)  
   11.6 [Run Dev (Server + Client)](#116-run-dev-server--client)  
   11.7 [Quick API Sanity Checks](#117-quick-api-sanity-checks)  
   11.8 [Realtime Manual Test (Two Tabs)](#118-realtime-manual-test-two-tabs)  
   11.9 [Offline Queue Manual Test](#119-offline-queue-manual-test)  
   11.10 [Reset Database (Clean Slate)](#1110-reset-database-clean-slate)  
12. [Testing](#12-testing)  
13. [IMPORTANT: Tests can change your dev dataset](#13-important-tests-can-change-your-dev-dataset)  
14. [Troubleshooting](#14-troubleshooting)  
15. [Performance Notes](#15-performance-notes)  
16. [Roadmap / If I Had More Time](#16-roadmap--if-i-had-more-time)  

---
## Requirements

| Requirement / Task | Status | Where / Notes |
|---|---|---|
| Stack: SQLite + Prisma • Express • SSE • React (JS) | ✅ Done | Server + client implemented in JS. |
| Shared playlist (single collaborative playlist) | ✅ Done | Stored in SQLite; all clients see same playlist. |
| Track library (predefined) | ✅ Done | Seed provides track library; `GET /api/tracks`. |
| Initial playlist (8–10 tracks) | ✅ Done | Seed includes initial playlist items + one playing. |
| Add track to playlist | ✅ Done | `POST /api/playlist` + UI Add. |
| Prevent duplicate track add | ✅ Done | Returns `DUPLICATE_TRACK` on duplicate. |
| Remove track from playlist | ✅ Done | `DELETE /api/playlist/:id` + UI Remove. |
| Reorder via drag-and-drop | ✅ Done | UI DnD + `PATCH /api/playlist/:id` updates `position`. |
| Position algorithm (required exact implementation) | ✅ Done | Implemented + tested (server + client). |
| Voting up/down (votes can be negative) | ✅ Done | `POST /api/playlist/:id/vote`. |
| Optional auto-sort by votes toggle | ✅ Done | UI toggle and derived ordering. |
| Mark track as “Now Playing” | ✅ Done | `PATCH /api/playlist/:id { is_playing: true }`. |
| Now Playing exclusivity (only one true) | ✅ Done | Server enforces exclusivity. |
| Search/filter track library | ✅ Done | Client search includes genre. |
| Realtime endpoint: GET /api/stream (SSE) | ✅ Done | Implemented and tested. |
| Heartbeat ping event | ✅ Done | `{ type: "ping", ts }` every ~15s. |
| Realtime event types | ✅ Done | track.added/removed/moved/voted/playing + playlist.reordered. |
| Connection indicator (online/offline/reconnecting) | ✅ Done | Client shows status. |
| Auto-reconnect with exponential backoff | ✅ Done | Backoff with a cap. |
| Optimistic UI + reconcile | ✅ Done | Optimistic updates + server reconciliation. |
| Offline queue | ✅ Done | Queue + replay on reconnect. |
| Dedup / out-of-order prevention | ✅ Done | Monotonic `eventId`, client ignores stale. |
| Tests pass with single command | ✅ Done | `npm test` runs server + client tests. |

---


## 1) Tech Stack

- **Frontend:** React (Vite) — JavaScript
- **Backend:** Node.js + Express — JavaScript
- **Database:** SQLite via Prisma ORM
- **Realtime:** Server‑Sent Events (SSE)
- **Testing:** Jest (server) + Vitest (client)

---

## 2) Repository / Project Structure

```text
collab-playlist-100/
  package.json
  .env.example
  README.md

  server/
    package.json
    .env.example
    server.js
    sseBus.js
    playlistLogic.js

    prisma/
      schema.prisma
      seed.js

    test/
      position.test.js
      api.test.js
      sse.test.js

  client/
    package.json
    vite.config.js
    index.html

    src/
      main.jsx
      App.jsx
      api.js
      position.js
      offlineQueue.js
      styles.css

    test/
      position.test.js
```

---

## 3) Feature Matrix (What’s Included)

### Shared playlist (single playlist for everyone)
- One playlist persisted in SQLite (`PlaylistTrack` table)
- Everyone sees the same list and same ordering

### Track library (predefined)
- A seeded library of **40 tracks** across multiple genres (Rock/Pop/Electronic/Jazz/Classical)

### Playlist operations
- Add track from library
- Remove track
- Reorder via drag‑and‑drop (**position float algorithm required by spec**)
- Vote up/down (votes can be negative)
- Mark one track as **Now Playing** (server enforces exclusivity)

### Simulated playback
- Now Playing bar shows title/artist
- Progress bar auto-advances
- Seek by mouse (click/drag)
- Keyboard shortcuts:
  - `Space`: play/pause
  - `←/→`: seek ±5 seconds
- Skip moves to next track

### Realtime sync (SSE)
- Changes broadcast to all connected windows via `/api/stream`
- Heartbeat ping every 15s
- Client auto-reconnect with exponential backoff
- Dedup/out‑of‑order protection using `eventId`
- Offline action queue (client stores actions while offline and replays on reconnect)

### UI/UX
- Two-panel layout (Playlist + Track Library)
- Responsive/mobile layout (playlist-first; rows wrap so titles don’t disappear)
- Drop indicator line during drag reorder
- Vote pulse animation
- Now Playing pulsing pill + auto-scroll into view

---

## 4) Architecture Overview

- **SQLite + Prisma** stores tracks + playlist state.
- **Express REST API** is the source of truth for writes (add/remove/vote/reorder/now-playing).
- **SSE** pushes updates to all connected clients.
- The **client** maintains a local view of playlist state, uses **optimistic updates**, then reconciles with SSE/server.

### 4.1) How Data Flows

1. Client performs an action (vote/reorder/add/remove/play).
2. Client applies optimistic update immediately (for responsiveness).
3. Client sends REST request to server.
4. Server validates + writes to SQLite (Prisma).
5. Server broadcasts an SSE event describing the change (with monotonic `eventId`).
6. All clients receive SSE event:
   - apply if `eventId` is newer than the last applied event
   - optionally refetch playlist if needed for reconciliation

### 4.2) Why SSE (not WebSocket)

SSE was chosen because:
- One-way server → client broadcast is the primary requirement.
- Built-in auto-reconnect semantics.
- Simple implementation in Express.
- Less protocol complexity than WebSockets for this scope.

Writes still go through REST endpoints.

---

## 5) Data Model (Prisma + SQLite)

### Prisma schema
Location: `server/prisma/schema.prisma`

Models implemented exactly as required:

**Track**
- id, title, artist, album, duration_seconds, genre, cover_url

**PlaylistTrack**
- id, track_id (unique), position (float), votes, added_by, added_at, is_playing, played_at

### Seed data
Location: `server/prisma/seed.js`

Seed includes:
- **40 library tracks**
- **10 initial playlist items**
- votes from **-2 to 10**
- exactly **one** `is_playing=true`

---

## 6) Required Position Algorithm (Implemented Exactly)

Implemented in both server and client:
- `server/playlistLogic.js`
- `client/src/position.js`

```js
function calculatePosition(prevPosition, nextPosition) {
  if (prevPosition == null && nextPosition == null) return 1.0;
  if (prevPosition == null) return nextPosition - 1;
  if (nextPosition == null) return prevPosition + 1;
  return (prevPosition + nextPosition) / 2;
}
```

This allows infinite insertions between items without reindexing.

---

## 7) API Documentation

Base URL: `http://localhost:4000`

### `GET /api/tracks`
Returns the predefined library.

### `GET /api/playlist`
Returns the current playlist ordered by `position`.

### `POST /api/playlist`
Adds a track to the playlist:

```json
{ "track_id": "track-5", "added_by": "User456" }
```

Duplicates are prevented (DB unique constraint) and return:

```json
{
  "error": {
    "code": "DUPLICATE_TRACK",
    "message": "This track is already in the playlist",
    "details": { "track_id": "track-5" }
  }
}
```

### `PATCH /api/playlist/:id`
Updates:
- `position` (reorder)
- `is_playing` (set now playing; server ensures only one is true)

### `POST /api/playlist/:id/vote`
```json
{ "direction": "up" }
```

### `DELETE /api/playlist/:id`
Removes the playlist item (204).

---

## 8) Realtime (SSE) Protocol

### Endpoint
- `GET /api/stream`

### 8.1) Heartbeat
Server sends:
```json
{ "type": "ping", "ts": "..." }
```

### 8.2) Event Types
```json
{ "type": "track.added", "item": { /* full playlist item */ } }
{ "type": "track.removed", "id": "..." }
{ "type": "track.moved", "item": { "id": "...", "position": 2.5 } }
{ "type": "track.voted", "item": { "id": "...", "votes": 6 } }
{ "type": "track.playing", "id": "..." }
{ "type": "playlist.reordered", "items": [ /* full list */ ] }
```

### 8.3) Dedup / Out-of-order Handling
Every broadcast includes a monotonic `eventId`. The client ignores any event with `eventId <= lastEventId` to prevent duplicates/out-of-order issues after reconnect.

---

## 9) Offline Queue Behavior

If the client goes offline:
- UI status shows Offline
- actions (add/remove/vote/move/play) are queued in `localStorage`
- when online again, queued actions replay in order

This is implemented in `client/src/offlineQueue.js`.

---

## 10) UI/UX Notes + Keyboard Shortcuts

Keyboard shortcuts:
- `Space`: play/pause
- `←/→`: seek ±5 seconds

---

## 11) Setup + Run Locally (A → Z)

### 11.1) Prerequisites
- Node.js 18+ recommended (Node 20 LTS recommended)
- npm installed

Verify:
```bash
node -v
npm -v
```

### 11.2) Install Dependencies
From repo root:
```bash
npm run install:all
```

### 11.3) Environment Variables
Create `server/.env`:
```env
PORT=4000
DATABASE_URL="file:./dev.db"
```

### 11.4) Database Migration (Prisma)
From repo root:
```bash
npm run db:migrate
```

### 11.5) Seed Data
From repo root:
```bash
npm run db:seed
```

### 11.6) Run Dev (Server + Client)
From repo root:
```bash
npm run dev
```

Open:
- UI: http://localhost:3000
- API: http://localhost:4000

### 11.7) Quick API Sanity Checks
```bash
curl http://localhost:4000/
curl http://localhost:4000/api/tracks
curl http://localhost:4000/api/playlist
```

### 11.8) Realtime Manual Test (Two Tabs)
1. Open **two** browser windows/tabs to http://localhost:3000
2. In Window A:
   - vote a track
   - reorder tracks
   - set now playing
3. Window B should update within ~1 second.

### 11.9) Offline Queue Manual Test
1. Open app (one or two tabs).
2. In DevTools → Network, set **Offline**.
3. Perform some actions (vote/reorder/add/remove).
4. Set Network back to **Online**.
5. Verify actions replay and other tab syncs.

### 11.10) Reset Database (Clean Slate)
**Windows PowerShell** (from repo root):
```powershell
Remove-Item -Force server\dev.db
npm run db:migrate
npm run db:seed
```

Then restart:
```bash
npm run dev
```

---

## 12) Testing (Single Command)

Run all tests:
```bash
npm test
```

Includes:
- position algorithm tests
- API tests (add, duplicate prevention, vote, reorder, now playing exclusivity)
- SSE test (heartbeat + broadcast)

---

## 13) IMPORTANT: Tests can change your dev dataset

### Why it happens
Tests currently use the same SQLite database file as development (`server/dev.db`).  
Some tests populate a small dataset (e.g., “Song 1 / Song 2 / Song 3”) which can replace your dev data.

### Restore the full dataset (40 tracks)
**Windows PowerShell** (from repo root):
```powershell
Remove-Item -Force server\dev.db
npm run db:migrate
npm run db:seed
```

Then restart:
```bash
npm run dev
```

> Recommended improvement (not done here): use a separate `test.db` for Jest so tests never touch dev data.

---

## 14) Troubleshooting

- **DB errors / missing tables:** run `npm run db:migrate`
- **Empty playlist/library:** run `npm run db:seed`
- **Realtime not updating:** verify SSE stream is reachable:
  ```bash
  curl -N http://localhost:4000/api/stream
  ```

---

## 15) Performance Notes

- Float `position` avoids expensive reindexing on reorder.
- For very large playlists (200+), UI list virtualization would be the next step.

---

## 16) Roadmap / If I Had More Time

- **Dedicated test database (`test.db`)**
  - Configure Jest to use a separate SQLite file so running `npm test` never modifies the development dataset.
  - Add automated migrate + seed steps for tests (setup/teardown).

- **E2E tests (Playwright)**
  - Multi-tab realtime sync tests (vote/reorder/now playing).
  - Offline queue tests by forcing offline/online mode.

- **SSE resume with `Last-Event-ID`**
  - Allow clients to recover missed events after reconnect.
  - Add a bounded server-side event buffer.

- **Performance for 200+ playlist items**
  - Client list virtualization (e.g., `react-window`) and memoization.
  - Coalesce reorder events to reduce re-render/network chatter.