import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { getElective } from "@/lib/content";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

async function currentUserId(): Promise<string | Response> {
  if (!auth || !pool) return Response.json({ error: "Accounts are not configured" }, { status: 503 });
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Not signed in" }, { status: 401 });
  return session.user.id;
}

async function electiveSlug(request: Request): Promise<string | Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const slug = (body as { slug?: unknown })?.slug;
  if (typeof slug !== "string" || !getElective(slug)) {
    return Response.json({ error: "Unknown elective" }, { status: 404 });
  }
  return slug;
}

/** The electives the signed-in learner is taking. */
export async function GET() {
  const userId = await currentUserId();
  if (userId instanceof Response) return userId;
  const { rows } = await pool!.query<{ elective_slug: string }>(
    "select elective_slug from elective_enrollment where user_id = $1",
    [userId],
  );
  return Response.json({ electives: rows.map((r) => r.elective_slug) });
}

/** Take an elective. */
export async function POST(request: Request) {
  const userId = await currentUserId();
  if (userId instanceof Response) return userId;
  const slug = await electiveSlug(request);
  if (slug instanceof Response) return slug;
  await pool!.query(
    "insert into elective_enrollment (user_id, elective_slug) values ($1, $2) on conflict do nothing",
    [userId, slug],
  );
  return Response.json({ enrolled: true });
}

/** Leave an elective. Lesson progress is kept, so rejoining picks up where you left off. */
export async function DELETE(request: Request) {
  const userId = await currentUserId();
  if (userId instanceof Response) return userId;
  const slug = await electiveSlug(request);
  if (slug instanceof Response) return slug;
  await pool!.query("delete from elective_enrollment where user_id = $1 and elective_slug = $2", [userId, slug]);
  return Response.json({ enrolled: false });
}
