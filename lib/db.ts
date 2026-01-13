import { Pool, neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';
import { WebSocket } from 'ws';

// 1. Configure Neon to use WebSockets
neonConfig.webSocketConstructor = WebSocket;

// 2. Setup the Connection
const connectionString = process.env.DATABASE_URL!;

const pool = new Pool({ connectionString });

// 3. Create the Adapter
// 🔴 FIX: Cast 'pool' to 'any' to bypass the TypeScript mismatch
const adapter = new PrismaNeon(pool as any);

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// 4. Instantiate Prisma
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;