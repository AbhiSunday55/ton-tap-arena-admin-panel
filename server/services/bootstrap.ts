// ══════════════════════════════════════════════════════════════════════════════
// ONE-TIME PANEL BOOTSTRAP (idempotent).
//
// The console has no sign-up route on purpose: it must be reachable only by the
// administrator. So the administrator row is created here, server-side, the
// first time the panel is used — together with the ingest token the game uses to
// push its data, and a full copy of the game's config defaults so every control
// in the editor reads a real value from the first load.
//
// Safe to call on every request: each step checks first and writes only what is
// missing.
// ══════════════════════════════════════════════════════════════════════════════
import { eq } from "drizzle-orm";
import { configValues, gameConnection, users } from "../../drizzle/schema";
import { registerLocalUser } from "../_core/auth";
import { getPanelValue, setPanelValue } from "../_core/panel-store";
import { ADMIN_EMAIL_KEY } from "../_core/panel-auth";

// Imported lazily, inside bootstrapOnce, on purpose: `_core/db` reads
// DATABASE_URL at module load, so a top-level import would make this module
// (and therefore anything that imports it — including server/routers.ts)
// unloadable in a unit test that does not provide a database.
async function getDb() {
  const { db } = await import("../_core/db");
  return db;
}
import { CONFIG_FIELDS, DEFAULT_CONFIG, getPath } from "../../shared/config-schema";

/** The administrator's sign-in password for THIS console. */
export const ADMIN_PASSWORD = "Abhijeet12@";

/** Stable internal identity for the single administrator account. Not a mailbox
 *  anyone reads — it exists only so the platform's session layer has a user row
 *  to bind, and it is never shown anywhere in the game. */
export const DEFAULT_ADMIN_EMAIL = "admin@ton-tap-arena.local";

export const INGEST_TOKEN_KEY = "ingest_token";

/** Where the game's public base URL is mirrored, so the bridge can find it
 *  without a DB round-trip when the connection row is missing. */
export const GAME_BASE_URL_KEY = "game_base_url";

/** A URL-safe 48-char token for the game→panel data push. */
function newToken(): string {
  return (
    crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "")
  ).slice(0, 48);
}

let bootstrapped: Promise<string> | null = null;

/** Ensure the admin account, ingest token and default config all exist.
 *  Returns the administrator's email. Cached per process. */
export function ensurePanelBootstrapped(): Promise<string> {
  if (!bootstrapped) {
    bootstrapped = bootstrapOnce().catch((e) => {
      bootstrapped = null; // let the next request retry rather than caching a failure
      throw e;
    });
  }
  return bootstrapped;
}

async function bootstrapOnce(): Promise<string> {
  const db = await getDb();

  // 1 — administrator identity + ingest token
  let email = await getPanelValue<string>(ADMIN_EMAIL_KEY);
  if (!email) {
    email = DEFAULT_ADMIN_EMAIL;
    await setPanelValue(ADMIN_EMAIL_KEY, email);
  }
  const token = await getPanelValue<string>(INGEST_TOKEN_KEY);
  if (!token) await setPanelValue(INGEST_TOKEN_KEY, newToken());

  // 2 — the administrator account itself (created once, password never re-set
  //     here so a changed password survives every restart)
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!existing) {
    try {
      await registerLocalUser(email, ADMIN_PASSWORD, "Administrator");
    } catch {
      // A concurrent request won the race — the row exists now, which is the goal.
    }
    await db.update(users).set({ role: "admin" }).where(eq(users.email, email));
  } else if (existing.role !== "admin") {
    await db.update(users).set({ role: "admin" }).where(eq(users.email, email));
  }

  // 3 — seed EVERY editable path with the game's own default, so the editor has
  //     a complete, real surface from the first load and "reset" has a target.
  const [row] = await db.select({ path: configValues.path }).from(configValues).limit(1);
  if (!row) {
    const defaults = DEFAULT_CONFIG as unknown as Record<string, unknown>;
    const entries = CONFIG_FIELDS.map((f) => ({
      path: f.path as string,
      value: getPath(defaults, f.path as string) as never,
      updatedBy: "bootstrap",
    }));
    if (entries.length > 0) {
      await db.insert(configValues).values(entries).onConflictDoNothing({ target: configValues.path });
    }
  }

  // 4 — a game_connection row, so /system has something to edit
  const [conn] = await db.select().from(gameConnection).where(eq(gameConnection.id, "default")).limit(1);
  if (!conn) {
    await db.insert(gameConnection).values({ id: "default", baseUrl: "", enabled: true }).onConflictDoNothing();
  }

  return email;
}
