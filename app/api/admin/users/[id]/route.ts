import { requireAdminApi } from "@/lib/admin";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Delete an account and, through cascading foreign keys, its sessions, progress and electives. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/admin/users/[id]">) {
  const session = await requireAdminApi();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  if (id === session.user.id) return Response.json({ error: "You can't delete your own account here" }, { status: 400 });
  const { rowCount } = await pool!.query(`delete from "user" where id = $1`, [id]);
  if (!rowCount) return Response.json({ error: "No such user" }, { status: 404 });
  return Response.json({ deleted: true });
}
