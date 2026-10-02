import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "../_core/trpc";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

/**
 * Password-only gate. There is no email field and no sign-up link on purpose:
 * the console has exactly one administrator account, created server-side at
 * first boot, and this form is the only way in.
 */
export default function Login() {
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const login = trpc.panel.login.useMutation({
    onSuccess: (res) => {
      // Prime the session cache BEFORE navigating. `<Protected>` reads this same
      // query, and on a cached `authenticated: false` it would redirect straight
      // back to /login on its first render — the refetch that would correct it
      // resolves a moment later, by which time the redirect has already won.
      // Writing the fresh result first makes the guard see the truth immediately.
      utils.panel.session.setData(undefined, {
        authenticated: true,
        email: res.email,
        name: res.name,
      });
      setLocation("/dashboard");
    },
    onError: (e) => setError(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!password) {
      setError("Enter the admin password.");
      return;
    }
    login.mutate({ password });
  }

  return (
    <div className="panel-page flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-card text-xl">
            🎯
          </div>
          <p className="panel-eyebrow">TON Tap Arena</p>
          <h1 className="panel-title mt-1">Control Panel</h1>
          <p className="panel-caption mt-1">Administrator access only.</p>
        </div>

        <form onSubmit={submit} className="rounded-xl border border-border bg-card p-5 shadow-lg">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="admin-password">Admin password</Label>
            <Input
              id="admin-password"
              type="password"
              autoFocus
              autoComplete="current-password"
              placeholder="••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="font-mono"
            />
          </div>

          {error ? (
            <p
              role="alert"
              className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300"
            >
              {error}
            </p>
          ) : null}

          <Button type="submit" className="mt-4 w-full" disabled={login.isPending}>
            {login.isPending ? "Signing in…" : "Sign in"}
          </Button>

          <p className="panel-caption mt-4 text-center">
            This panel edits the live game. Changes apply immediately.
          </p>
        </form>
      </div>
    </div>
  );
}
