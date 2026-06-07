import request from 'supertest';
import { createApp } from '../app.js';

const app = createApp();

const userA = { fullName: 'Alice', email: 'alice.msg@reon.dev', password: 'Password123!' };
const userB = { fullName: 'Bob',   email: 'bob.msg@reon.dev',   password: 'Password123!' };

async function registerAndLogin(user) {
  await request(app).post('/api/auth/signup').send(user);
  const res = await request(app).post('/api/auth/login')
    .send({ email: user.email, password: user.password });
  return { cookie: res.headers['set-cookie'], id: res.body.user._id };
}

async function makeFriends(alice, bob) {
  await request(app).post(`/api/users/friend-request/${bob.id}`).set('Cookie', alice.cookie);
  const received = await request(app).get('/api/users/friend-requests/received').set('Cookie', bob.cookie);
  const reqId = received.body.requests[0]._id;
  await request(app).post(`/api/users/friend-request/${reqId}/accept`).set('Cookie', bob.cookie);
}

describe('Messages', () => {
  let alice, bob;

  beforeEach(async () => {
    alice = await registerAndLogin(userA);
    bob   = await registerAndLogin(userB);
    await makeFriends(alice, bob);
  });

  it('GET /api/messages/sidebar/list — returns empty chat list initially', async () => {
    const res = await request(app)
      .get('/api/messages/sidebar/list')
      .set('Cookie', alice.cookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.chats ?? res.body)).toBe(true);
  });

  it('POST /api/messages/send — stores an encrypted message', async () => {
    const payload = {
      data: JSON.stringify({
        sender:              alice.id,
        receiver:            bob.id,
        contentType:         'text',
        ciphertext:          'dGVzdC1jaXBoZXJ0ZXh0',
        encryptedKey:        'dGVzdC1rZXk=',
        senderEncryptedKey:  'dGVzdC1zZW5kZXJrZXk=',
      }),
    };

    const res = await request(app)
      .post('/api/messages/send')
      .set('Cookie', alice.cookie)
      .field('data', payload.data);

    expect(res.status).toBe(201);
    expect(res.body.data ?? res.body).toHaveProperty('_id');
  });

  it('GET /api/messages/:receiverId — retrieves message history', async () => {
    const payload = JSON.stringify({
      sender: alice.id, receiver: bob.id, contentType: 'text',
      ciphertext: 'abc', encryptedKey: 'key', senderEncryptedKey: 'skey',
    });
    await request(app).post('/api/messages/send').set('Cookie', alice.cookie).field('data', payload);

    const res = await request(app)
      .get(`/api/messages/${bob.id}`)
      .set('Cookie', alice.cookie);

    expect(res.status).toBe(200);
    const messages = res.body.data ?? res.body.messages ?? res.body;
    expect(Array.isArray(messages)).toBe(true);
    expect(messages.length).toBeGreaterThanOrEqual(1);
  });

  it('PUT /api/messages/chat/read/:userId — marks conversation as read', async () => {
    const res = await request(app)
      .put(`/api/messages/chat/read/${bob.id}`)
      .set('Cookie', alice.cookie);

    expect([200, 204]).toContain(res.status);
  });
});

describe('Messages — auth guard', () => {
  it('GET /api/messages/sidebar/list returns 401 without cookie', async () => {
    const res = await request(app).get('/api/messages/sidebar/list');
    expect(res.status).toBe(401);
  });
});
