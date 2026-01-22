const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const { app } = require('../server');

const prisma = new PrismaClient();

async function resetDb() {
  await prisma.playlistTrack.deleteMany();
  await prisma.track.deleteMany();

  // Minimal track set for tests
  await prisma.track.createMany({
    data: [
      { id: 't1', title: 'Song 1', artist: 'A', album: 'X', duration_seconds: 200, genre: 'Rock', cover_url: null },
      { id: 't2', title: 'Song 2', artist: 'B', album: 'Y', duration_seconds: 210, genre: 'Pop', cover_url: null },
      { id: 't3', title: 'Song 3', artist: 'C', album: 'Z', duration_seconds: 220, genre: 'Jazz', cover_url: null }
    ]
  });

  // initial playlist with 2 items
  await prisma.playlistTrack.create({
    data: { track_id: 't1', position: 1.0, votes: 0, added_by: 'User', is_playing: true, played_at: new Date() }
  });
  await prisma.playlistTrack.create({
    data: { track_id: 't2', position: 2.0, votes: 3, added_by: 'User', is_playing: false, played_at: null }
  });
}

beforeAll(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('API', () => {
  test('GET /api/tracks returns library', async () => {
    const res = await request(app).get('/api/tracks');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(3);
    expect(res.body[0]).toHaveProperty('id');
    expect(res.body[0]).toHaveProperty('title');
  });

  test('GET /api/playlist returns ordered playlist', async () => {
    const res = await request(app).get('/api/playlist');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    expect(res.body[0].position).toBeLessThan(res.body[1].position);
    expect(res.body[0]).toHaveProperty('track');
    expect(res.body[0].track).toHaveProperty('duration_seconds');
  });

  test('POST /api/playlist adds with calculated position', async () => {
    const res = await request(app)
      .post('/api/playlist')
      .send({ track_id: 't3', added_by: 'Anonymous' });

    expect(res.status).toBe(201);
    expect(res.body.track_id).toBe('t3');
    expect(typeof res.body.position).toBe('number');

    const after = await request(app).get('/api/playlist');
    expect(after.body.length).toBe(3);
  });

  test('POST /api/playlist prevents duplicates with DUPLICATE_TRACK', async () => {
    const res = await request(app)
      .post('/api/playlist')
      .send({ track_id: 't1', added_by: 'Someone' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error.code).toBe('DUPLICATE_TRACK');
    expect(res.body.error.details.track_id).toBe('t1');
  });

  test('POST /api/playlist/:id/vote increments votes', async () => {
    const list = await request(app).get('/api/playlist');
    const id = list.body[1].id; // second item

    const res = await request(app).post(`/api/playlist/${id}/vote`).send({ direction: 'up' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('votes');

    const list2 = await request(app).get('/api/playlist');
    const updated = list2.body.find((x) => x.id === id);
    expect(updated.votes).toBe(4);
  });

  test('PATCH /api/playlist/:id with is_playing keeps exclusivity', async () => {
    const list = await request(app).get('/api/playlist');
    const first = list.body[0].id;
    const second = list.body[1].id;

    // set second playing
    const res = await request(app).patch(`/api/playlist/${second}`).send({ is_playing: true });
    expect(res.status).toBe(200);

    const list2 = await request(app).get('/api/playlist');
    const playing = list2.body.filter((x) => x.is_playing);
    expect(playing.length).toBe(1);
    expect(playing[0].id).toBe(second);

    // ensure first is not playing
    const firstItem = list2.body.find((x) => x.id === first);
    expect(firstItem.is_playing).toBe(false);
  });

  test('PATCH /api/playlist/:id with position changes ordering', async () => {
    const list = await request(app).get('/api/playlist');
    const item = list.body[1]; // currently second
    const newPos = 0.5;

    const res = await request(app).patch(`/api/playlist/${item.id}`).send({ position: newPos });
    expect(res.status).toBe(200);

    const list2 = await request(app).get('/api/playlist');
    expect(list2.body[0].id).toBe(item.id);
    expect(list2.body[0].position).toBe(newPos);
  });

  test('DELETE /api/playlist/:id removes item', async () => {
    const list = await request(app).get('/api/playlist');
    const id = list.body[0].id;

    const res = await request(app).delete(`/api/playlist/${id}`);
    expect(res.status).toBe(204);

    const list2 = await request(app).get('/api/playlist');
    expect(list2.body.find((x) => x.id === id)).toBe(undefined);
  });
});