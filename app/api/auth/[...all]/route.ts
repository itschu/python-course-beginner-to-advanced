import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

const notConfigured = () =>
  Response.json(
    { error: "Accounts are not configured. Set DATABASE_URL and BETTER_AUTH_SECRET (see README)." },
    { status: 503 },
  );

const handlers = auth ? toNextJsHandler(auth) : null;

export const GET = (request: Request) => (handlers ? handlers.GET(request) : notConfigured());
export const POST = (request: Request) => (handlers ? handlers.POST(request) : notConfigured());
