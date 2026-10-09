"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { ProgressProvider, type RemoteSync } from "@/components/progress/progress-provider";
import { authClient } from "@/lib/auth-client";
import type { AuthStatus } from "@/lib/auth-status";
import { sanitizeProgress, type ProgressData } from "@/lib/progress";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

interface AuthContextValue extends AuthStatus {
  user: AuthUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  enabled: false,
  github: false,
  user: null,
  loading: false,
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

async function api(method: string, body?: unknown) {
  const response = await fetch("/api/progress", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    keepalive: method === "PUT",
  });
  if (!response.ok) throw new Error(`Progress sync failed (${response.status})`);
  return response.json();
}

function remoteFor(userId: string): RemoteSync {
  return {
    userId,
    pull: async () => sanitizeProgress((await api("GET")).lessons) as ProgressData,
    push: async (lessons) => {
      await api("PUT", { lessons });
    },
    clear: async () => {
      await api("DELETE");
    },
  };
}

function SignedInProviders({ status, children }: { status: AuthStatus; children: ReactNode }) {
  const { data, isPending } = authClient.useSession();
  const user = data?.user ?? null;
  const userId = user?.id;
  // A new RemoteSync per signed-in user triggers a fresh merge with the server.
  const remote = useMemo(() => (userId ? remoteFor(userId) : null), [userId]);
  const value = useMemo<AuthContextValue>(
    () => ({
      ...status,
      user: user ? { id: user.id, name: user.name, email: user.email, image: user.image } : null,
      loading: isPending,
      signOut: async () => {
        await authClient.signOut();
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, userId, user?.name, user?.email, user?.image, isPending],
  );
  return (
    <AuthContext.Provider value={value}>
      <ProgressProvider remote={remote}>{children}</ProgressProvider>
    </AuthContext.Provider>
  );
}

export function Providers({ auth, children }: { auth: AuthStatus; children: ReactNode }) {
  if (auth.enabled) return <SignedInProviders status={auth}>{children}</SignedInProviders>;
  return <ProgressProvider>{children}</ProgressProvider>;
}
