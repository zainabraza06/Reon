import request from 'supertest';
import { createApp } from '../app.js';

const app = createApp();

const userA = { fullName: 'Alice', email: 'alice@reon.dev', password: 'Password123!' };
const userB = { fullName: 'Bob',   email: 'bob@reon.dev',   password: 'Password123!' };

async function registerAndLogin(user) {
  await request(app).post('/api/auth/signup').send(user);
  const res = await request(app).post('/api/auth/login')
    .send({ email: user.email, password: user.password });
  return {
    cookie: res.headers['set-cookie'],
    id: res.body.user._id,
  };
}

describe('Friends', () => {
  let alice, bob;

  beforeEach(async () => {
    alice = await registerAndLogin(userA);
    bob   = await registerAndLogin(userB);
  });

  it('GET /api/users/friends — returns empty list initially', async () => {
    const res = await request(app)
      .get('/api/users/friends')
      .set('Cookie', alice.cookie);

    expect(res.status).toBe(200);
    expect(res.body.friends).toHaveLength(0);
  });

  it('POST /api/users/friend-request/:id — sends a friend request', async () => {
    const res = await request(app)
      .post(`/api/users/friend-request/${bob.id}`)
      .set('Cookie', alice.cookie);

    expect(res.status).toBe(201);
  });

  it('cannot send duplicate friend request', async () => {
    await request(app)
      .post(`/api/users/friend-request/${bob.id}`)
      .set('Cookie', alice.cookie);

    const res = await request(app)
      .post(`/api/users/friend-request/${bob.id}`)
      .set('Cookie', alice.cookie);

    expect(res.status).toBe(400);
  });

  it('GET /api/users/friend-requests/received — bob sees pending request', async () => {
    await request(app)
      .post(`/api/users/friend-request/${bob.id}`)
      .set('Cookie', alice.cookie);

    const res = await request(app)
      .get('/api/users/friend-requests/received')
      .set('Cookie', bob.cookie);

    expect(res.status).toBe(200);
    expect(res.body.requests.length).toBeGreaterThanOrEqual(1);
  });

  it('accept friend request — both users appear in each others friends list', async () => {
    await request(app)
      .post(`/api/users/friend-request/${bob.id}`)
      .set('Cookie', alice.cookie);

    const receivedRes = await request(app)
      .get('/api/users/friend-requests/received')
      .set('Cookie', bob.cookie);

    const requestId = receivedRes.body.requests[0]._id;

    const acceptRes = await request(app)
      .post(`/api/users/friend-request/${requestId}/accept`)
      .set('Cookie', bob.cookie);

    expect(acceptRes.status).toBe(200);

    const aliceFriends = await request(app)
      .get('/api/users/friends')
      .set('Cookie', alice.cookie);

    expect(aliceFriends.body.friends.some(f => f._id === bob.id)).toBe(true);
  });

  it('GET /api/users/friend-request/pending-count — returns 0 initially', async () => {
    const res = await request(app)
      .get('/api/users/friend-request/pending-count')
      .set('Cookie', alice.cookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('pendingCount');
    expect(Number(res.body.pendingCount ?? res.body.count)).toBe(0);
  });
});
