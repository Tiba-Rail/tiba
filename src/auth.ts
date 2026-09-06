import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { enabledSignInProviders } from "@/lib/auth-providers";
import { WALLET_NONCE_COOKIE, verifyWalletChallenge } from "@/lib/wallet-auth";

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
    credentials: {
      address: { label: "Sui address", type: "text" },
      nonce: { label: "Nonce", type: "text" },
      message: { label: "Message", type: "text" },
      signature: { label: "Signature", type: "text" }
    },
    async authorize(credentials) {
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
      if (!challenge || !signature) return null;

      try {
        await verifyPersonalMessageSignature(new TextEncoder().encode(message), signature, {
          address: challenge.address
        });
      } catch {
        return null;
      }

      const user = await prisma.user.upsert({
        where: { id: challenge.address },
        update: { name: `Sui wallet ${challenge.address.slice(0, 8)}` },
        create: { id: challenge.address, name: `Sui wallet ${challenge.address.slice(0, 8)}` }
      });

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image
      };
    }
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
