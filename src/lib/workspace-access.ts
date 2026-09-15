// Which workspace a server-rendered page may show. Pure so it is unit-tested; the cookie and
// session glue lives in operator-auth.ts.

/** Cookie holding sha256(owner key): it opens that workspace's pages but cannot call the owner APIs. */
export const OWNER_COOKIE = "tiba_owner";

/**
 * `accessible` is every workspace the viewer has proved they own (owner-key cookie first, then
 * the workspaces saved to their signed-in account). A requested id outside that list is refused,
 * never swapped for another workspace, so a guessed `?agent=` id reveals nothing.
 */
export function pickWorkspace<T extends { id: string }>(accessible: T[], requestedId?: string | null): T | null {
  if (requestedId) return accessible.find((workspace) => workspace.id === requestedId) ?? null;
  return accessible[0] ?? null;
}
