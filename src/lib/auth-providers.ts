export type SignInProvider = "google" | "github" | "sui-wallet";

export function enabledSignInProviders(): SignInProvider[] {
  const providers: SignInProvider[] = [];
  if (process.env.AUTH_GOOGLE_ID?.trim() && process.env.AUTH_GOOGLE_SECRET?.trim()) {
    providers.push("google");
  }
  if (process.env.AUTH_GITHUB_ID?.trim() && process.env.AUTH_GITHUB_SECRET?.trim()) {
    providers.push("github");
  }
  providers.push("sui-wallet");
  return providers;
}
