import type { NextRequest } from "next/server";

export function operatorTokenFrom(request: NextRequest): string | null {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : null;
}

export function isOperatorRequest(request: NextRequest): boolean {
  const expected = process.env.OPERATOR_TOKEN;
  const actual = operatorTokenFrom(request);
  return Boolean(expected && actual && actual === expected);
}
