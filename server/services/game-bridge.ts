// ══════════════════════════════════════════════════════════════════════════════
// THE LIVE GAME BRIDGE.
//
// This is what makes a panel save actually reach the running game. The game is a
// separate deployment (its own origin, its own Postgres, its own tRPC API), so
// the panel talks to it over HTTP — and, critically, it talks to the game's OWN
// admin API rather than poking at its database:
//
//   POST {base}/trpc/admin.login          { password }  → Set-Cookie tap_arena_admin
//   POST {base}/trpc/admin.setConfigBulk  { values }    → writes the game's `settings` table
//   GET  {base}/trpc/admin.getConfig                    → read back what the game actually has
//
// Because the game reads its config live on every state call, a write here shows
// up in the game immediately — no redeploy.
//
// The game's tRPC uses superjson, so request bodies are wrapped as
// `{ json: <input> }` (superjson-serialised payload) and responses come back as
// `{ result: { data: { json: <output> } } }`.
// ══════════════════════════════════════════════════════════════════════════════
import { DEFAULT_CONFIG, getPath } from "../../shared/config-schema";

const ADMIN_COOKIE = "tap_arena_admin";
/** The game ships this as its first-run admin password; the owner's password
 *  (@Abhijeet12@) replaces it on first successful login, after which that one is
 *  what the bridge logs in with. */
const GAME_DEFAULT_ADMIN_PASSWORD = "taparena";
const TIMEOUT_MS = 12_000;

export type BridgeResult<T> = { ok: true; data: T } | { ok: false; error: string };

export function normalizeBaseUrl(raw: string): string {
  let url = (raw ?? "").trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, "");
}

/** A superjson-shaped tRPC body. */
function body(input: unknown): string {
  return JSON.stringify({ json: input });
}

function fullUrl(baseUrl: string, path: string): string {
  return `${baseUrl}/trpc/${path}`;
}

/**
 * Pull a superjson tRPC response apart, or explain what came back instead.
 * A tRPC error arrives as `{ error: { json: { message } } }`.
 */
async function unwrap(res: Response): Promise<BridgeResult<unknown>> {
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: res.ok
        ? "The game sent a response this panel could not read (not JSON). Check the base URL points at the game's server."
        : `HTTP ${res.status} ${res.statusText || ""} from the game.`.trim(),
    };
  }
  const body = parsed as { result?: { data?: { json?: unknown } }; error?: { json?: { message?: string } } };
  if (body.error) return { ok: false, error: body.error.json?.message ?? "The game returned an error." };
  if (body.result?.data && "json" in body.result.data) return { ok: true, data: body.result.data.json };
  return { ok: true, data: body.result?.data ?? null };
}

/** Read `tap_arena_admin` out of a Set-Cookie header. */
function readAdminCookie(res: Response): string | null {
  const raw = res.headers.getSetCookie?.() ?? [];
  const all = raw.length ? raw : [res.headers.get("set-cookie") ?? ""];
  for (const line of all) {
    const m = /(?:^|,\s*)tap_arena_admin=([^;]+)/.exec(line);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** Log in to the game's admin API with the panel password and return the cookie. */
export async function gameAdminLogin(
  baseUrl: string,
  password: string,
): Promise<BridgeResult<{ cookie: string; usingDefaultPassword: boolean }>> {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) return { ok: false, error: "No game base URL is configured." };

  // The owner's panel password is the one the game's panel was set up with. If
  // the game is still on ITS first-run default (password never changed), retry
  // once with that so setup is never blocked by ordering.
  const attempts = password === GAME_DEFAULT_ADMIN_PASSWORD ? [password] : [password, GAME_DEFAULT_ADMIN_PASSWORD];
  let lastError = "The game rejected the admin password.";
  for (const pw of attempts) {
    try {
      const res = await fetch(fullUrl(base, "admin.login"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // The game only sets an HttpOnly SameSite=Lax cookie; no session needs
          // to be invented here, just a well-formed admin call.
          accept: "application/json",
        },
        body: body({ password: pw }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const out = await unwrap(res);
      if (!out.ok) {
        lastError = out.error;
        continue;
      }
      const cookie = readAdminCookie(res);
      if (!cookie) {
        lastError = "The game accepted the password but returned no admin session cookie.";
        continue;
      }
      const info = out.data as { usingDefaultPassword?: boolean } | null;
      return { ok: true, data: { cookie, usingDefaultPassword: Boolean(info?.usingDefaultPassword) } };
    } catch (e) {
      lastError = describeFetchError(e, base);
    }
  }
  return { ok: false, error: lastError };
}

function describeFetchError(e: unknown, base: string): string {
  if (e instanceof Error) {
    if (e.name === "TimeoutError") return `The game at ${base} did not answer in time.`;
    if (e.message.includes("fetch failed")) {
      return `Could not reach the game at ${base}. Check the base URL and that the game server is running.`;
    }
    return e.message;
  }
  return "Unknown network error talking to the game.";
}

/** Push a batch of dotted config paths into the game's own settings table. */
export async function pushConfig(
  baseUrl: string,
  cookie: string,
  values: Record<string, unknown>,
): Promise<BridgeResult<{ pushed: number }>> {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) return { ok: false, error: "No game base URL is configured." };
  if (Object.keys(values).length === 0) return { ok: true, data: { pushed: 0 } };
  try {
    const res = await fetch(fullUrl(base, "admin.setConfigBulk"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `${ADMIN_COOKIE}=${cookie}`,
        accept: "application/json",
      },
      body: body({ values }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const out = await unwrap(res);
    if (!out.ok) return { ok: false, error: out.error };
    return { ok: true, data: { pushed: Object.keys(values).length } };
  } catch (e) {
    return { ok: false, error: describeFetchError(e, base) };
  }
}

/**
 * Read the config the GAME currently holds. This is the source of truth for
 * "is my change live?" — it reflects the game's own database, not the panel's.
 */
export async function pullGameConfig(
  baseUrl: string,
  cookie: string,
): Promise<BridgeResult<{ config: Record<string, unknown>; overrides: Record<string, unknown> }>> {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) return { ok: false, error: "No game base URL is configured." };
  try {
    const res = await fetch(fullUrl(base, "admin.getConfig"), {
      method: "GET",
      headers: { cookie: `${ADMIN_COOKIE}=${cookie}`, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const out = await unwrap(res);
    if (!out.ok) return { ok: false, error: out.error };
    const data = (out.data ?? {}) as { config?: Record<string, unknown>; overrides?: Record<string, unknown> };
    return { ok: true, data: { config: data.config ?? {}, overrides: data.overrides ?? {} } };
  } catch (e) {
    return { ok: false, error: describeFetchError(e, base) };
  }
}

/**
 * Compare the panel's stored values against what the game reports, so the UI can
 * show "live ✓" or "out of sync" per field instead of assuming a push worked.
 */
export function diffAgainstGame(
  panelValues: Record<string, unknown>,
  gameOverrides: Record<string, unknown>,
): { path: string; panel: unknown; game: unknown }[] {
  const out: { path: string; panel: unknown; game: unknown }[] = [];
  for (const [path, value] of Object.entries(panelValues)) {
    const gv = path in gameOverrides ? gameOverrides[path] : getPath(DEFAULT_CONFIG as unknown as Record<string, unknown>, path);
    if (JSON.stringify(value) !== JSON.stringify(gv)) out.push({ path, panel: value, game: gv });
  }
  return out;
}
