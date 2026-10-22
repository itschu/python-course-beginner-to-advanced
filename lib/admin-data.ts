import "server-only";

import { pool } from "@/lib/db";

/** Exercises marked passed in one lesson_progress row's JSON. */
const PASSED_EXERCISES = `(select count(*) from jsonb_each(coalesce(lp.data->'exercises', '{}'::jsonb)) x
  where (x.value->>'passed')::boolean)`;

export interface Overview {
  users: number;
  newLast7: number;
  newLast30: number;
  activeLast7: number;
  activeLast30: number;
  lessonsCompleted: number;
  exercisesPassed: number;
  signupsByWeek: { week: string; count: number }[];
  enrolments: Record<string, number>;
}

export async function getOverview(): Promise<Overview> {
  const db = pool!;
  const [users, activity, weeks, enrolments] = await Promise.all([
    db.query<{ users: string; new7: string; new30: string }>(
      `select count(*) users,
              count(*) filter (where "createdAt" > now() - interval '7 days') new7,
              count(*) filter (where "createdAt" > now() - interval '30 days') new30
       from "user"`,
    ),
    db.query<{ active7: string; active30: string; completed: string; exercises: string }>(
      `select count(distinct user_id) filter (where updated_at > now() - interval '7 days') active7,
              count(distinct user_id) filter (where updated_at > now() - interval '30 days') active30,
              count(*) filter (where (data->>'completed')::boolean) completed,
              coalesce(sum(${PASSED_EXERCISES}), 0) exercises
       from lesson_progress lp`,
    ),
    db.query<{ week: Date; count: string }>(
      `select date_trunc('week', "createdAt") week, count(*) count
       from "user" where "createdAt" > now() - interval '12 weeks'
       group by 1 order by 1`,
    ),
    db.query<{ elective_slug: string; count: string }>(
      "select elective_slug, count(*) count from elective_enrollment group by 1",
    ),
  ]);
  const u = users.rows[0];
  const a = activity.rows[0];
  return {
    users: Number(u.users),
    newLast7: Number(u.new7),
    newLast30: Number(u.new30),
    activeLast7: Number(a.active7),
    activeLast30: Number(a.active30),
    lessonsCompleted: Number(a.completed),
    exercisesPassed: Number(a.exercises),
    signupsByWeek: weeks.rows.map((r) => ({ week: r.week.toISOString().slice(0, 10), count: Number(r.count) })),
    enrolments: Object.fromEntries(enrolments.rows.map((r) => [r.elective_slug, Number(r.count)])),
  };
}

/** Learners who started (have any progress in) and completed each lesson, keyed by lesson key. */
export async function getLessonActivity(): Promise<Map<string, { started: number; completed: number }>> {
  const { rows } = await pool!.query<{ lesson_key: string; started: string; completed: string }>(
    `select lesson_key, count(*) started, count(*) filter (where (data->>'completed')::boolean) completed
     from lesson_progress group by lesson_key`,
  );
  return new Map(rows.map((r) => [r.lesson_key, { started: Number(r.started), completed: Number(r.completed) }]));
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  lastActive: Date | null;
  lessonsCompleted: number;
  exercisesPassed: number;
  electives: string[];
}

const PAGE_SIZE = 50;

/** Users, newest first, optionally filtered by a search on name or email. */
export async function listUsers(search: string, page: number, limit = PAGE_SIZE) {
  const pattern = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const where = search ? `where u.email ilike $1 or u.name ilike $1` : "";
  const params: unknown[] = search ? [pattern] : [];
  const [rows, total] = await Promise.all([
    pool!.query<{
      id: string;
      name: string;
      email: string;
      created_at: Date;
      last_active: Date | null;
      completed: string | null;
      exercises: string | null;
      electives: string[] | null;
    }>(
      `select u.id, u.name, u.email, u."createdAt" created_at, p.last_active, p.completed, p.exercises, e.electives
       from "user" u
       left join lateral (
         select max(lp.updated_at) last_active,
                count(*) filter (where (lp.data->>'completed')::boolean) completed,
                sum(${PASSED_EXERCISES}) exercises
         from lesson_progress lp where lp.user_id = u.id
       ) p on true
       left join lateral (
         select array_agg(elective_slug order by elective_slug) electives
         from elective_enrollment ee where ee.user_id = u.id
       ) e on true
       ${where}
       order by u."createdAt" desc
       limit ${Number(limit)} offset ${Number(Math.max(0, page - 1) * limit)}`,
      params,
    ),
    pool!.query<{ count: string }>(`select count(*) count from "user" u ${where}`, params),
  ]);
  const users: UserRow[] = rows.rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    createdAt: r.created_at,
    lastActive: r.last_active,
    lessonsCompleted: Number(r.completed ?? 0),
    exercisesPassed: Number(r.exercises ?? 0),
    electives: r.electives ?? [],
  }));
  return { users, total: Number(total.rows[0].count), pageSize: limit };
}

export interface UserDetail {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date;
  providers: string[];
  lastSession: Date | null;
  electives: { slug: string; enrolledAt: Date }[];
  lessons: { key: string; completed: boolean; exercisesPassed: number; updatedAt: Date }[];
}

export async function getUser(id: string): Promise<UserDetail | null> {
  const db = pool!;
  const user = await db.query<{ id: string; name: string; email: string; emailVerified: boolean; createdAt: Date }>(
    `select id, name, email, "emailVerified", "createdAt" from "user" where id = $1`,
    [id],
  );
  if (!user.rows[0]) return null;
  const [accounts, sessions, electives, lessons] = await Promise.all([
    db.query<{ providerId: string }>(`select distinct "providerId" from account where "userId" = $1`, [id]),
    db.query<{ last: Date | null }>(`select max("updatedAt") last from session where "userId" = $1`, [id]),
    db.query<{ elective_slug: string; enrolled_at: Date }>(
      "select elective_slug, enrolled_at from elective_enrollment where user_id = $1 order by enrolled_at",
      [id],
    ),
    db.query<{ lesson_key: string; completed: boolean | null; exercises: string; updated_at: Date }>(
      `select lp.lesson_key, (lp.data->>'completed')::boolean completed, ${PASSED_EXERCISES} exercises, lp.updated_at
       from lesson_progress lp where lp.user_id = $1 order by lp.updated_at desc`,
      [id],
    ),
  ]);
  const u = user.rows[0];
  return {
    ...u,
    providers: accounts.rows.map((r) => r.providerId),
    lastSession: sessions.rows[0]?.last ?? null,
    electives: electives.rows.map((r) => ({ slug: r.elective_slug, enrolledAt: r.enrolled_at })),
    lessons: lessons.rows.map((r) => ({
      key: r.lesson_key,
      completed: Boolean(r.completed),
      exercisesPassed: Number(r.exercises),
      updatedAt: r.updated_at,
    })),
  };
}

/** Distinct learners with any progress in each phase or elective, keyed by its slug. */
export async function getSectionLearners(): Promise<Map<string, number>> {
  const { rows } = await pool!.query<{ section: string; learners: string }>(
    `select split_part(lesson_key, '/', 1) section, count(distinct user_id) learners
     from lesson_progress group by 1`,
  );
  return new Map(rows.map((r) => [r.section, Number(r.learners)]));
}
