require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { PrismaClient } = require('@prisma/client');
const { addClient, removeClient, broadcast, sendPing } = require('./sseBus');
const { calculatePosition } = require('./playlistLogic');

const prisma = new PrismaClient();
const app = express();

const PORT = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/', (req, res) => {
  res.type('text').send('API is running. Try /api/tracks, /api/playlist, /api/stream');
});

function apiTrack(t) {
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    album: t.album,
    duration_seconds: t.duration_seconds,
    genre: t.genre,
    cover_url: t.cover_url ?? null
  };
}

function apiPlaylistItem(p) {
  return {
    id: p.id,
    track_id: p.track_id,
    track: {
      title: p.track.title,
      artist: p.track.artist,
      duration_seconds: p.track.duration_seconds
    },
    position: p.position,
    votes: p.votes,
    added_by: p.added_by,
    is_playing: p.is_playing,
    added_at: p.added_at.toISOString(),
    played_at: p.played_at ? p.played_at.toISOString() : null
  };
}

/**
 * ✅ Spec-compliant canonical ordering: ORDER BY position ASC
 * (Votes are still returned, but do not affect global order.)
 */
async function fetchPlaylistForBroadcast() {
  const items = await prisma.playlistTrack.findMany({
    orderBy: { position: 'asc' },
    include: { track: true }
  });
  return items.map(apiPlaylistItem);
}

// GET /api/tracks
app.get('/api/tracks', async (req, res) => {
  const tracks = await prisma.track.findMany({ orderBy: { title: 'asc' } });
  res.json(tracks.map(apiTrack));
});

// GET /api/playlist ✅ ordered by position (per spec)
app.get('/api/playlist', async (req, res) => {
  const items = await prisma.playlistTrack.findMany({
    orderBy: { position: 'asc' },
    include: { track: true }
  });
  res.json(items.map(apiPlaylistItem));
});

// POST /api/playlist (add)
app.post('/api/playlist', async (req, res) => {
  const body = req.body || {};

  // track_id is a STRING in your app (example: "track-9")
  const track_id = typeof body.track_id === 'string' ? body.track_id.trim() : '';

  const added_by =
    typeof body.added_by === 'string' && body.added_by.trim() ? body.added_by.trim() : 'Anonymous';

  if (!track_id) {
    return res.status(400).json({
      error: { code: 'INVALID_REQUEST', message: 'track_id is required' }
    });
  }

  const last = await prisma.playlistTrack.findFirst({ orderBy: { position: 'desc' } });
  const position = calculatePosition(last ? last.position : null, null);

  try {
    const created = await prisma.playlistTrack.create({
      data: {
        track_id,
        position,
        added_by
      },
      include: { track: true }
    });

    const item = apiPlaylistItem(created);
    broadcast({ type: 'track.added', item });

    // Broadcast full list (ordered by position)
    const items = await fetchPlaylistForBroadcast();
    broadcast({ type: 'playlist.reordered', items });

    res.status(201).json(item);
  } catch (e) {
    if (e.code === 'P2002') {
      return res.status(400).json({
        error: {
          code: 'DUPLICATE_TRACK',
          message: 'This track is already in the playlist',
          details: { track_id }
        }
      });
    }
    console.error(e);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Unexpected error' } });
  }
});

// PATCH /api/playlist/:id (position and/or is_playing)
app.patch('/api/playlist/:id', async (req, res) => {
  const { id } = req.params;
  const { position, is_playing } = req.body || {};

  const existing = await prisma.playlistTrack.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Playlist item not found' } });
  }

  // is_playing: only one true
  if (is_playing === true) {
    await prisma.$transaction([
      prisma.playlistTrack.updateMany({
        data: { is_playing: false },
        where: { is_playing: true }
      }),
      prisma.playlistTrack.update({
        where: { id },
        data: { is_playing: true, played_at: new Date() }
      })
    ]);

    broadcast({ type: 'track.playing', id });
  }

  if (typeof position === 'number' && Number.isFinite(position)) {
    await prisma.playlistTrack.update({
      where: { id },
      data: { position }
    });

    broadcast({ type: 'track.moved', item: { id, position } });

    const items = await fetchPlaylistForBroadcast();
    broadcast({ type: 'playlist.reordered', items });
  }

  res.json({ ok: true });
});

// POST /api/playlist/:id/vote
app.post('/api/playlist/:id/vote', async (req, res) => {
  const { id } = req.params;
  const { direction } = req.body || {};

  if (direction !== 'up' && direction !== 'down') {
    return res.status(400).json({
      error: { code: 'INVALID_REQUEST', message: 'direction must be "up" or "down"' }
    });
  }

  const existing = await prisma.playlistTrack.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Playlist item not found' } });
  }

  const delta = direction === 'up' ? 1 : -1;
  const updated = await prisma.playlistTrack.update({
    where: { id },
    data: { votes: { increment: delta } }
  });

  broadcast({ type: 'track.voted', item: { id, votes: updated.votes } });

  // Broadcast full list (ordered by position)
  const items = await fetchPlaylistForBroadcast();
  broadcast({ type: 'playlist.reordered', items });

  res.json({ id, votes: updated.votes });
});

// DELETE /api/playlist/:id
app.delete('/api/playlist/:id', async (req, res) => {
  const { id } = req.params;

  const existing = await prisma.playlistTrack.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Playlist item not found' } });
  }

  await prisma.playlistTrack.delete({ where: { id } });

  broadcast({ type: 'track.removed', id });

  const items = await fetchPlaylistForBroadcast();
  broadcast({ type: 'playlist.reordered', items });

  res.status(204).end();
});

// SSE: GET /api/stream
app.get('/api/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive'
  });
  res.flushHeaders?.();

  const clientId = addClient(res);

  // immediate ping so client knows it is connected
  sendPing(res);

  const interval = setInterval(() => sendPing(res), 15000);

  req.on('close', () => {
    clearInterval(interval);
    removeClient(clientId);
  });
});

module.exports = { app };

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`API server listening on http://localhost:${PORT}`);
  });
}