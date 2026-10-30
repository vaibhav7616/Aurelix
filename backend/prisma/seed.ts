// Development seed (`npx prisma db seed`). The logic lives in src/bootstrap/seed.ts so production can run it too.
import { PrismaClient } from '@prisma/client';
import { runSeed } from '../src/bootstrap/seed';

const prisma = new PrismaClient();
void runSeed(prisma)
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => void prisma.$disconnect());
