import request from 'supertest';
import { createApp } from '../app.js';

const app = createApp();

const TEST_USER = {
  fullName: 'Test User',
  email:    'test@reon.dev',
  password: 'Password123!',
};

describe('Auth — POST /api/auth/signup', () => {
  it('creates a new user and returns 201', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send(TEST_USER);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('message');
  });

  it('rejects duplicate email with 400', async () => {
    await request(app).post('/api/auth/signup').send(TEST_USER);
    const res = await request(app).post('/api/auth/signup').send(TEST_USER);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already in use/i);
  });

  it('rejects missing fields with 400', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'a@b.com' }); // missing fullName and password
    expect(res.status).toBe(400);
  });
});

describe('Auth — POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/signup').send(TEST_USER);
  });

  it('logs in with correct credentials and returns user + cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.email).toBe(TEST_USER.email);
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('rejects wrong password with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: 'WrongPassword!' });

    expect(res.status).toBe(401);
  });

  it('rejects unknown email with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@reon.dev', password: 'Whatever1!' });

    expect(res.status).toBe(401);
  });
});

describe('Auth — GET /api/auth/me', () => {
  it('returns user for authenticated session', async () => {
    await request(app).post('/api/auth/signup').send(TEST_USER);
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });

    const cookie = loginRes.headers['set-cookie'];

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe(TEST_USER.email);
  });

  it('returns 401 without a session', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('Auth — POST /api/auth/logout', () => {
  it('clears the session cookie', async () => {
    await request(app).post('/api/auth/signup').send(TEST_USER);
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });

    const cookie = loginRes.headers['set-cookie'];

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookie);

    expect(logoutRes.status).toBe(200);
  });
});
