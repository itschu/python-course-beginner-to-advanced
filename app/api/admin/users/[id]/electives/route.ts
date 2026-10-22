import { requireAdminApi } from "@/lib/admin";
import { getElective } from "@/lib/content";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

async function target(request: Request, ctx: RouteContext<"/api/admin/users/[id]/electives">) {
  const session = await requireAdminApi();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  let slug: unknown;
  try {
    slug = (await request.json())?.slug;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof slug !== "string" || !getElective(slug)) return Response.json({ error: "Unknown elective" }, { status: 404 });
  const { rowCount } = await pool!.query(`select 1 from "user" where id = $1`, [id]);
  if (!rowCount) return Response.json({ error: "No such user" }, { status: 404 });
  return { id, slug };
}

/** Enrol a learner in an elective. */
export async function POST(request: Request, ctx: RouteContext<"/api/admin/users/[id]/electives">) {
  const t = await target(request, ctx);
  if (t instanceof Response) return t;
  await pool!.query(
    "insert into elective_enrollment (user_id, elective_slug) values ($1, $2) on conflict do nothing",
    [t.id, t.slug],
  );
  return Response.json({ enrolled: true });
}

/** Remove a learner from an elective (their lesson progress is kept). */
export async function DELETE(request: Request, ctx: RouteContext<"/api/admin/users/[id]/electives">) {
  const t = await target(request, ctx);
  if (t instanceof Response) return t;
  await pool!.query("delete from elective_enrollment where user_id = $1 and elective_slug = $2", [t.id, t.slug]);
  return Response.json({ enrolled: false });
}
