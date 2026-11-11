export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { assertSolanaStartup } = await import("./lib/rails/solana.ts");
  assertSolanaStartup();
}
