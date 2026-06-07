import { MongoMemoryServer } from 'mongodb-memory-server';

export default async function globalSetup() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  process.env.JWT_SECRET = 'test-secret-jwt-key-for-testing-only';
  process.env.NODE_ENV = 'test';
  // Store instance so globalTeardown can stop it
  global.__MONGOD__ = mongod;
}
