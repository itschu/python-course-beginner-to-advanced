import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { pool } from "@/lib/db";
import { mergeLesson, sanitizeLesson, sanitizeProgress, type ProgressData } from "@/lib/progress";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2_000_000;
const MAX_LESSONS_PER_REQUEST = 500;

async function currentUserId(): Promise<string | Response> {
  if (!auth || !pool) return Response.json({ error: "Accounts are not configured" }, { status: 503 });
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Not signed in" }, { status: 401 });
  return session.user.id;
}

/** All saved progress for the signed-in learner. */
export async function GET() {
  const userId = await currentUserId();
  if (userId instanceof Response) return userId;
  const { rows } = await pool!.query<{ lesson_key: string; data: unknown }>(
    "select lesson_key, data from lesson_progress where user_id = $1",
    [userId],
  );
  const lessons: ProgressData = {};
  for (const row of rows) {
    const lesson = sanitizeLesson(row.data);
    if (lesson) lessons[row.lesson_key] = lesson;
  }
  return Response.json({ lessons });
}

/** Merge the given lessons into what's stored (never loses progress made on another device). */
export async function PUT(request: Request) {
  const userId = await currentUserId();
  if (userId instanceof Response) return userId;

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return Response.json({ error: "Request too large" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const incoming = sanitizeProgress((body as { lessons?: unknown })?.lessons);
  const keys = Object.keys(incoming);
  if (keys.length > MAX_LESSONS_PER_REQUEST) return Response.json({ error: "Too many lessons" }, { status: 413 });
  if (keys.length === 0) return Response.json({ saved: 0 });

  const client = await pool!.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query<{ lesson_key: string; data: unknown }>(
      "select lesson_key, data from lesson_progress where user_id = $1 and lesson_key = any($2) for update",
      [userId, keys],
    );
    const existing = new Map(rows.map((r) => [r.lesson_key, sanitizeLesson(r.data) ?? undefined]));
    for (const key of keys) {
      const merged = mergeLesson(existing.get(key), incoming[key]);
      await client.query(
        `insert into lesson_progress (user_id, lesson_key, data, updated_at)
         values ($1, $2, $3, now())
         on conflict (user_id, lesson_key) do update set data = excluded.data, updated_at = now()`,
        [userId, key, JSON.stringify(merged)],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return Response.json({ saved: keys.length });
}

/** Delete all of the learner's progress. */
export async function DELETE() {
  const userId = await currentUserId();
  if (userId instanceof Response) return userId;
  await pool!.query("delete from lesson_progress where user_id = $1", [userId]);
  return Response.json({ deleted: true });
}
