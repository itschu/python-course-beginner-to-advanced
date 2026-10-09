/**
 * Which account features are configured. Read on the server (env vars are not
 * exposed to the browser) and passed down to client components as props.
 */
export interface AuthStatus {
  /** Email/password accounts and progress sync are available. */
  enabled: boolean;
  /** "Continue with GitHub" is available. */
  github: boolean;
}

export function authStatus(): AuthStatus {
  const enabled = Boolean((process.env.DATABASE_URL ?? process.env.POSTGRES_URL) && process.env.BETTER_AUTH_SECRET);
  return {
    enabled,
    github: enabled && Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
  };
}
