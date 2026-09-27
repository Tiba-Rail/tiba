const LOCAL_DATABASE_HOSTS = new Set(["", "localhost", "127.0.0.1"]);
const PUBLIC_DEMO_KEY = "tiba_testnet_demo_key";

export function databaseHost(databaseUrl = "") {
  try {
    return new URL(databaseUrl).hostname;
  } catch {
    return "";
  }
}

export function assertDatabaseWipeAllowed(env = process.env) {
  const dbHost = databaseHost(env.DATABASE_URL ?? "");
  if (!LOCAL_DATABASE_HOSTS.has(dbHost) && env.ALLOW_DB_WIPE !== dbHost) {
    throw new Error(
      `Refusing to empty every table on ${dbHost}. Set ALLOW_DB_WIPE=${dbHost} to confirm.`
    );
  }
  return dbHost;
}

export function requireSeedAgentKey(env = process.env, dbHost = databaseHost(env.DATABASE_URL ?? "")) {
  const key = env.SEED_AGENT_KEY;
  if (!key) {
    throw new Error("SEED_AGENT_KEY must be set.");
  }
  if (key === PUBLIC_DEMO_KEY && !LOCAL_DATABASE_HOSTS.has(dbHost)) {
    throw new Error("Refusing to use the public demo agent key on a non-local database.");
  }
  return key;
}
