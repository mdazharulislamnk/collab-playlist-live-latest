const request = require('supertest');
const http = require('http');
const { PrismaClient } = require('@prisma/client');
const { app } = require('../server');

const prisma = new PrismaClient();

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

describe('SSE', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    // ensure at least one playlist item exists for voting
    const count = await prisma.track.count();
    if (count === 0) {
      await prisma.track.createMany({
        data: [
          { id: 's1', title: 'S1', artist: 'A', album: 'X', duration_seconds: 200, genre: 'Rock', cover_url: null },
          { id: 's2', title: 'S2', artist: 'B', album: 'Y', duration_seconds: 200, genre: 'Pop', cover_url: null }
        ]
      });
      await prisma.playlistTrack.create({
        data: { track_id: 's1', position: 1.0, votes: 0, added_by: 'User', is_playing: true, played_at: new Date() }
      });
    }

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  }, 20000);

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await prisma.$disconnect();
  });

  test('SSE sends heartbeat ping and broadcasts events', async () => {
    jest.setTimeout(25000);

    const playlistRes = await request(baseUrl).get('/api/playlist');
    expect(playlistRes.status).toBe(200);
    const id = playlistRes.body[0].id;

    const events = [];

    let sseRes;
    let resolveClosed;
    const closed = new Promise((r) => (resolveClosed = r));

    const req = http.request(`${baseUrl}/api/stream`, { method: 'GET' }, (res) => {
      sseRes = res;
      res.setEncoding('utf8');

      // Ensure we can await proper shutdown
      res.on('close', () => resolveClosed());
      res.on('end', () => resolveClosed());
      res.on('error', () => resolveClosed());

      let buffer = '';
      res.on('data', (chunk) => {
        buffer += chunk;
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const line = part.split('\n').find((l) => l.startsWith('data: '));
          if (line) {
            const json = line.slice('data: '.length);
            try {
              events.push(JSON.parse(json));
            } catch {
              // ignore
            }
          }
        }
      });
    });

    req.on('error', () => resolveClosed());
    req.end();

    try {
      // wait for ping
      for (let i = 0; i < 30; i++) {
        if (events.some((e) => e.type === 'ping')) break;
        await wait(200);
      }
      expect(events.some((e) => e.type === 'ping')).toBe(true);

      // trigger a vote -> should broadcast track.voted
      const voteRes = await request(baseUrl).post(`/api/playlist/${id}/vote`).send({ direction: 'up' });
      expect(voteRes.status).toBe(200);

      for (let i = 0; i < 30; i++) {
        if (events.some((e) => e.type === 'track.voted')) break;
        await wait(200);
      }
      expect(events.some((e) => e.type === 'track.voted')).toBe(true);
    } finally {
      // Close SSE cleanly and WAIT for it to actually close
      if (sseRes) sseRes.destroy();
      req.destroy();

      // Prevent hanging if close already happened
      await Promise.race([closed, wait(1000)]);
    }
  });
});