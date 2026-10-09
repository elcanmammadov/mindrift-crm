import { seedDemo, DEMO_PASSWORD, JURY_EMAIL, JURY_PASSWORD } from '../src/seed/demo.js';
import { prisma } from '../src/db.js';

// Production start-up: create the accounts and sample data only on a brand-new database.
const users = await prisma.user.count();
if (users === 0) {
  await seedDemo();
  console.log(`Fresh database seeded. Accounts (password ${DEMO_PASSWORD}): elcan@mindrift.az (admin), nihat@mindrift.az, ataxan@mindrift.az; jury: ${JURY_EMAIL} / ${JURY_PASSWORD}`);
} else {
  console.log(`Database already has ${users} users — seed skipped.`);
}
await prisma.$disconnect();
