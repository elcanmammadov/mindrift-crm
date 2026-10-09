import { seedDemo, DEMO_PASSWORD } from '../src/seed/demo.js';
import { prisma } from '../src/db.js';

seedDemo()
  .then(() => {
    console.log('Demo data seeded.');
    console.log(`Accounts (password ${DEMO_PASSWORD}): elcan@mindrift.az (admin), nihat@mindrift.az, ataxan@mindrift.az`);
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
