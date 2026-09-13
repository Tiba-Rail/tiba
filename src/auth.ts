import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { enabledSignInProviders } from "@/lib/auth-providers";
import { WALLET_NONCE_COOKIE, verifySolanaSignature, verifyWalletChallenge } from "@/lib/wallet-auth";

const walletCredentials = { address: { label: "Wallet address", type: "text" }, nonce: { label: "Nonce", type: "text" }, message: { label: "Message", type: "text" }, signature: { label: "Signature", type: "text" } };

async function authorizeWallet(credentials: Partial<Record<string, unknown>> | undefined) {
  const address = typeof credentials?.address === "string" ? credentials.address : "";
  const nonce = typeof credentials?.nonce === "string" ? credentials.nonce : "";
  const message = typeof credentials?.message === "string" ? credentials.message : "";
  const signature = typeof credentials?.signature === "string" ? credentials.signature : "";
  const cookieStore = await cookies();
  const challenge = verifyWalletChallenge({ cookieValue: cookieStore.get(WALLET_NONCE_COOKIE)?.value, addressValue: address, nonce, message });
  if (!challenge || !signature || !verifySolanaSignature(challenge.address, message, signature)) return null;
  const name = `Solana wallet ${challenge.address.slice(0, 8)}`;
  const user = await prisma.user.upsert({ where: { id: challenge.address }, update: { name }, create: { id: challenge.address, name } });
  return { id: user.id, name: user.name, email: user.email, image: user.image };
}

const enabledProviders = enabledSignInProviders();
const providers = [
  ...(enabledProviders.includes("google") ? [Google({ clientId: process.env.AUTH_GOOGLE_ID!, clientSecret: process.env.AUTH_GOOGLE_SECRET! })] : []),
  ...(enabledProviders.includes("github") ? [GitHub({ clientId: process.env.AUTH_GITHUB_ID!, clientSecret: process.env.AUTH_GITHUB_SECRET! })] : []),
  Credentials({ id: "solana-wallet", name: "Solana wallet", credentials: walletCredentials, authorize: authorizeWallet })
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  providers,
  callbacks: { async session({ session, token }) { if (session.user && token.sub) session.user.id = token.sub; return session; } }
});
