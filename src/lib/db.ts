import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export class DatabaseUnavailableError extends Error {
  constructor(message = "Database unavailable") {
    super(message);
    this.name = "DatabaseUnavailableError";
  }
}

const CONNECTIVITY_CODES = new Set([
  "P1000",
  "P1001",
  "P1002",
  "P1003",
  "P1008",
  "P1009",
  "P1010",
  "P1011",
  "P1012",
  "P1013",
  "P1014"
]);

export function isDatabaseError(err: unknown): boolean {
  if (err instanceof DatabaseUnavailableError) return true;
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; code?: string; message?: string };
  const message = e.message ?? "";
  if (e.name === "PrismaClientInitializationError" || e.name === "PrismaClientRustPanicError") {
    return true;
  }
  if (e.code && CONNECTIVITY_CODES.has(e.code)) return true;
  if (/tenant\/user\s+\S+\s+not found/i.test(message)) return true;
  if (
    /can't reach database server|cannot reach database|econnrefused|enotfound|etimedout|connection refused|connection terminated|the database system is|password authentication failed|no such host|getaddrinfo/i.test(
      message
    )
  ) {
    return true;
  }
  return false;
}

function createPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new DatabaseUnavailableError("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export function getPrisma(): PrismaClient {
  try {
    return (globalForPrisma.prisma ??= createPrisma());
  } catch (err) {
    if (err instanceof DatabaseUnavailableError) throw err;
    throw new DatabaseUnavailableError(err instanceof Error ? err.message : "Database unavailable");
  }
}

// Lazy proxy so importing this module does not connect or throw when DATABASE_URL is
// missing or unreachable. The first real query constructs the client.
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma();
    const value = Reflect.get(client, prop, client) as unknown;
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(client) : value;
  }
});

if (process.env.NODE_ENV !== "production") {
  try {
    if (process.env.DATABASE_URL) globalForPrisma.prisma = getPrisma();
  } catch {
    // Leave uninitialized; the next query will throw DatabaseUnavailableError.
  }
}

export async function tryDb<T>(fn: (db: PrismaClient) => Promise<T>): Promise<T | null> {
  try {
    return await fn(getPrisma());
  } catch (err) {
    if (isDatabaseError(err)) {
      console.error("[tiba] database unavailable:", err instanceof Error ? err.message : err);
      return null;
    }
    throw err;
  }
}
