// Production seed entrypoint (compiled into dist/; no tsx needed).
import { PrismaClient } from '@prisma/client';
import { runSeed } from './seed';

const prisma = new PrismaClient();
void runSeed(prisma)
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => void prisma.$disconnect());
