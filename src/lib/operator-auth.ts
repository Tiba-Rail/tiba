import { createHash } from "node:crypto";
import type { Agent } from "@prisma/client";
import type { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { OWNER_COOKIE, pickWorkspace } from "@/lib/workspace-access";

export function operatorTokenFrom(request: NextRequest): string | null {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : null;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Workspace for an owner-key hash. The legacy global OPERATOR_TOKEN acts as the first workspace. */
async function agentForOwnerHash(tokenHash: string): Promise<Agent | null> {
  const legacy = process.env.OPERATOR_TOKEN;
  if (legacy && tokenHash === hash(legacy)) {
    return prisma.agent.findFirst({ orderBy: { createdAt: "asc" } });
  }
  return prisma.agent.findUnique({ where: { ownerTokenHash: tokenHash } });
}

export async function agentForOwnerKey(ownerKey: string): Promise<Agent | null> {
  return agentForOwnerHash(hash(ownerKey));
}

export async function resolveOperatorAgent(request: NextRequest): Promise<Agent | null> {
  const token = operatorTokenFrom(request);
  return token ? agentForOwnerKey(token) : null;
}

/** Lets this browser open the workspace pages. Only the key's hash is stored, httpOnly. */
export function setOwnerCookie(response: NextResponse, ownerKey: string): void {
  response.cookies.set(OWNER_COOKIE, hash(ownerKey), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60
  });
}

/**
 * The workspace a server-rendered page may show: one proven by the owner-key cookie or saved to
 * the signed-in account. Null means show the unlock screen, never somebody else's data.
 */
export async function viewerWorkspace(requestedId?: string): Promise<Agent | null> {
  const cookieHash = (await cookies()).get(OWNER_COOKIE)?.value;
  const fromCookie = cookieHash ? await agentForOwnerHash(cookieHash) : null;

  let userId: string | undefined;
  try {
    userId = (await auth())?.user?.id;
  } catch {
    userId = undefined; // Sign-in is optional; the owner key alone is enough.
  }
  const owned = userId
    ? await prisma.agent.findMany({ where: { userId }, orderBy: { createdAt: "desc" } })
    : [];

  const accessible = fromCookie ? [fromCookie, ...owned.filter((agent) => agent.id !== fromCookie.id)] : owned;
  return pickWorkspace(accessible, requestedId);
}
