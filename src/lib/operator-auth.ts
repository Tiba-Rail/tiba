import { createHash } from "node:crypto";
import type { Agent } from "@prisma/client";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export function operatorTokenFrom(request: NextRequest): string | null {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : null;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function resolveOperatorAgent(request: NextRequest): Promise<Agent | null> {
  const token = operatorTokenFrom(request);
  if (!token) return null;

  // Legacy global operator token falls back to the first agent for back-compat.
  const expected = process.env.OPERATOR_TOKEN;
  if (expected && token === expected) {
    return prisma.agent.findFirst({ orderBy: { createdAt: "asc" } });
  }

  // Per-workspace owner token.
  return prisma.agent.findUnique({ where: { ownerTokenHash: hash(token) } });
}

export async function isOperatorRequest(request: NextRequest): Promise<boolean> {
  const token = operatorTokenFrom(request);
  if (!token) return false;

  const expected = process.env.OPERATOR_TOKEN;
  if (expected && token === expected) return true;

  const agent = await prisma.agent.findUnique({
    where: { ownerTokenHash: hash(token) },
    select: { id: true }
  });
  return Boolean(agent);
}
