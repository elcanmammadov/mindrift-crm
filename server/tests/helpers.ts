import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { seedDemo, DEMO_PASSWORD } from '../src/seed/demo.js';
import { hashPassword } from '../src/auth/session.js';

export const app = createApp();

export async function resetDemo() {
  return seedDemo();
}

/** Logged-in supertest agent; adds the CSRF header to every request. */
export async function login(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').set('X-Requested-With', 'mindrift').send({ email, password: DEMO_PASSWORD });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  const h = { 'X-Requested-With': 'mindrift' };
  return {
    get: (url: string) => agent.get(url).set(h),
    post: (url: string, body?: object) => agent.post(url).set(h).send(body ?? {}),
    patch: (url: string, body?: object) => agent.patch(url).set(h).send(body ?? {}),
    put: (url: string, body?: object) => agent.put(url).set(h).send(body ?? {}),
  };
}

export const publicApi = {
  get: (url: string) => request(app).get(url),
  post: (url: string, body?: object) => request(app).post(url).send(body ?? {}),
};

/** An agent with no relation to any seeded case (exists only in the test database). */
export async function outsiderAgent() {
  const email = 'outsider@test.local';
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  await prisma.user.upsert({ where: { email }, create: { email, name: 'Test Outsider', role: 'AGENT', passwordHash }, update: { passwordHash } });
  return login(email);
}

export const caseByTitle = (title: string) => prisma.customerCase.findFirstOrThrow({ where: { title } });
