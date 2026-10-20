import "server-only";

import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { pool } from "@/lib/db";

/**
 * What the current visitor can do with an elective:
 * - "open": accounts aren't configured on this site, so there's nobody to sign in and the elective is open to all
 * - "signed-out": locked preview, with a prompt to sign in
 * - "not-enrolled": signed in, but hasn't chosen to take it (preview, with a "Take this elective" button)
 * - "enrolled": full access
 */
export type ElectiveAccess = "open" | "signed-out" | "not-enrolled" | "enrolled";

export const isUnlocked = (access: ElectiveAccess) => access === "open" || access === "enrolled";

export async function electiveAccess(slug: string): Promise<ElectiveAccess> {
  if (!auth || !pool) return "open";
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return "signed-out";
  const { rowCount } = await pool.query(
    "select 1 from elective_enrollment where user_id = $1 and elective_slug = $2",
    [session.user.id, slug],
  );
  return rowCount ? "enrolled" : "not-enrolled";
}
