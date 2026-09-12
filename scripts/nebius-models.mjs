// Lists the model ids this NEBIUS_API_KEY can call on Nebius Token Factory (ids only), so the
// NEBIUS_MODEL_* env vars can be set to real ids.
// Usage: npm run nebius:models            (reads ./.env)
//        node scripts/nebius-models.mjs path/to/.env
try {
  process.loadEnvFile(process.argv[2] ?? ".env");
} catch {
  // No .env file: the key may come from the shell.
}

const key = process.env.NEBIUS_API_KEY;
if (!key) {
  console.error("NEBIUS_API_KEY is not set. Add it to .env or pass the .env path as the first argument.");
  process.exit(1);
}

const response = await fetch("https://api.tokenfactory.nebius.com/v1/models", {
  headers: { authorization: `Bearer ${key}` }
});
if (!response.ok) {
  console.error(`Token Factory answered HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  process.exit(1);
}
const { data = [] } = await response.json();
for (const id of data.map((model) => model.id).sort()) console.log(id);
