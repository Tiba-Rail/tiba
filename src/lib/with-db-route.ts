import { isDatabaseError } from "@/lib/db";

export const DATABASE_UNAVAILABLE_MESSAGE = "Receipt not available right now";

export function databaseUnavailableResponse(status = 503): Response {
  return Response.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status });
}

// Preserve each route handler's own request/context types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withDbRoute<T extends (...args: any[]) => any>(handler: T): T {
  const wrapped = (async (...args: Parameters<T>) => {
    try {
      return await handler(...args);
    } catch (err) {
      if (isDatabaseError(err)) {
        console.error("[tiba] database unavailable:", err instanceof Error ? err.message : err);
        return databaseUnavailableResponse();
      }
      throw err;
    }
  }) as T;
  return wrapped;
}
