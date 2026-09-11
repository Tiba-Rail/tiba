import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { enabledSignInProviders } from "@/lib/auth-providers";
import { WALLET_NONCE_COOKIE, verifySolanaSignature, verifyWalletChallenge, walletChain } from "@/lib/wallet-auth";

const walletCredentials = {
  address: { label: "Wallet address", type: "text" },
  nonce: { label: "Nonce", type: "text" },
  message: { label: "Message", type: "text" },
  signature: { label: "Signature", type: "text" }
};

// Shared by both wallet providers: check the signed nonce cookie, then the chain's own
// signature check, then upsert the user. User ids are the address (0x… for Sui, base58
// for Solana), so the two can never collide.
async function authorizeWallet(
  credentials: Partial<Record<string, unknown>> | undefined,
  chain: "sui" | "solana",
  signatureOk: (address: string, message: string, signature: string) => Promise<boolean>
) {
  const address = typeof credentials?.address === "string" ? credentials.address : "";
  const nonce = typeof credentials?.nonce === "string" ? credentials.nonce : "";
  const message = typeof credentials?.message === "string" ? credentials.message : "";
  const signature = typeof credentials?.signature === "string" ? credentials.signature : "";
  const cookieStore = await cookies();
  const challenge = verifyWalletChallenge({
    cookieValue: cookieStore.get(WALLET_NONCE_COOKIE)?.value,
    addressValue: address,
    nonce,
    message
  });
  if (!challenge || !signature || walletChain(challenge.address) !== chain) return null;
  if (!(await signatureOk(challenge.address, message, signature))) return null;

  const name = `${chain === "solana" ? "Solana" : "Sui"} wallet ${challenge.address.slice(0, 8)}`;
  const user = await prisma.user.upsert({
    where: { id: challenge.address },
    update: { name },
    create: { id: challenge.address, name }
  });

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image
  };
}

const enabledProviders = enabledSignInProviders();
const providers = [
  ...(enabledProviders.includes("google")
    ? [Google({ clientId: process.env.AUTH_GOOGLE_ID!, clientSecret: process.env.AUTH_GOOGLE_SECRET! })]
    : []),
  ...(enabledProviders.includes("github")
    ? [GitHub({ clientId: process.env.AUTH_GITHUB_ID!, clientSecret: process.env.AUTH_GITHUB_SECRET! })]
    : []),
  Credentials({
    id: "sui-wallet",
    name: "Sui wallet",
    credentials: walletCredentials,
    authorize: (credentials) =>
      authorizeWallet(credentials, "sui", async (address, message, signature) => {
        try {
          await verifyPersonalMessageSignature(new TextEncoder().encode(message), signature, { address });
          return true;
        } catch {
          return false;
        }
      })
  }),
  Credentials({
    id: "solana-wallet",
    name: "Solana wallet",
    credentials: walletCredentials,
    authorize: (credentials) =>
      authorizeWallet(credentials, "solana", async (address, message, signature) =>
        verifySolanaSignature(address, message, signature)
      )
  })
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Credentials providers require JWT sessions. The adapter still persists
  // OAuth users/accounts and wallet users are upserted in authorize above.
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  providers,
  callbacks: {
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    }
  }
});
