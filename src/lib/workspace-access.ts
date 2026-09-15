// Which workspace a server-rendered page may show. Pure so it is unit-tested; the cookie and
// session glue lives in operator-auth.ts.

/** Cookie holding sha256(owner key): it opens that workspace's pages but cannot call the owner APIs. */
export const OWNER_COOKIE = "tiba_owner";

export type WorkspaceView<T> = { workspace: T; readOnly: boolean };

/**
 * `accessible` is every workspace the viewer has proved they own (owner-key cookie first, then
 * the workspaces saved to their signed-in account). A requested id outside that list is refused,
 * never swapped for another workspace, so a guessed `?agent=` id reveals nothing.
 *
 * The one exception is `demo`, the shared demo wallet behind TIBA_AGENT_KEY (synthetic
 * test-network data). The home page's "See the demo wallet" opens it, so anyone may view it,
 * read-only: when they own no workspace, or when they ask for it by id.
 */
export function pickWorkspace<T extends { id: string }>(
  accessible: T[],
  requestedId?: string | null,
  demo?: T | null
): WorkspaceView<T> | null {
  const own = requestedId ? accessible.find((workspace) => workspace.id === requestedId) : accessible[0];
  if (own) return { workspace: own, readOnly: false };
  if (demo && (!requestedId || requestedId === demo.id)) return { workspace: demo, readOnly: true };
  return null;
}
