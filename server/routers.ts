// ── AGENT-OWNED: tRPC API surface ─────────────────────────────────────────────
// TON Tap Arena — ADMIN CONTROL PANEL.
//
// One password-protected console. Every procedure that touches data is built on
// `panelProcedure`, which requires a valid session cookie AND that the session
// belong to the panel's single configured administrator — so the guard is
// server-side and cannot be bypassed by hiding a button.
//
// Two procedures are deliberately PUBLIC:
//   * panel.login        — the password gate itself (nothing is returned but the session)
//   * config.public      — the game's live config (secrets stripped), which is how
//                          a saved change reaches the running game with no redeploy
// and `ingest.push` is authenticated with a bearer token instead of a session.
//
// Auth is provided by _core — sessions are never reimplemented here.
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import { authProvider, registerLocalUser, AuthError, EmailTakenError } from "./_core/auth";
import { storageCommit, storageDeleteOwned, storageListByOwner, storagePutUrl, StorageError } from "./_core/storage";
import { panelProcedure } from "./_core/panel-auth";
import { getPanelValue, setPanelValue } from "./_core/panel-store";
import { ensurePanelBootstrapped, INGEST_TOKEN_KEY, GAME_BASE_URL_KEY, ADMIN_PASSWORD } from "./services/bootstrap";
import {
  CONFIG_FIELDS,
  CONFIG_GROUPS,
  DEFAULT_CONFIG,
  SECRET_MASK,
  getPath,
  isSecretPath,
  publicConfig,
  resolveConfig,
  validateField,
} from "../shared/config-schema";
import {
  diffAgainstGame,
  gameAdminLogin,
  normalizeBaseUrl,
  pullGameConfig,
  pushConfig,
} from "./services/game-bridge";
import * as q from "./db";

// ══════════════════════════════════════════════════════════════════════════════
// Panel auth — a SINGLE administrator, reached by password only.
// ══════════════════════════════════════════════════════════════════════════════

// A tiny in-process throttle for the password gate. It is NOT the security
// boundary (the bcrypt compare is); it only makes online guessing cost real time.
const attempts = new Map<string, { count: number; firstAt: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function throttleKey(c: { req: { header: (n: string) => string | undefined } }): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "local";
}

function checkThrottle(key: string): void {
  const rec = attempts.get(key);
  if (!rec) return;
  if (Date.now() - rec.firstAt > WINDOW_MS) {
    attempts.delete(key);
    return;
  }
  if (rec.count >= MAX_ATTEMPTS) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many failed attempts. Wait a few minutes and try again.",
    });
  }
}

function noteFailure(key: string): void {
  const rec = attempts.get(key);
  if (!rec || Date.now() - rec.firstAt > WINDOW_MS) attempts.set(key, { count: 1, firstAt: Date.now() });
  else rec.count += 1;
}

function clearFailures(key: string): void {
  attempts.delete(key);
}

const panelRouter = router({
  /** Who am I? Drives the login gate on every page load. Never throws. */
  session: publicProcedure.query(async ({ ctx }) => {
    try {
      await ensurePanelBootstrapped();
    } catch {
      return { authenticated: false, email: null as string | null, name: null as string | null };
    }
    const adminEmail = await getPanelValue<string>("admin_email");
    const isAdmin = !!ctx.user && !!adminEmail && ctx.user.email.toLowerCase() === adminEmail.toLowerCase();
    return {
      authenticated: isAdmin,
      email: isAdmin ? ctx.user!.email : null,
      name: isAdmin ? (ctx.user!.name ?? "Administrator") : null,
    };
  }),

  /**
   * Password-only sign-in. There is no email field on purpose: the console has
   * exactly one account, created server-side at first boot, and this is the only
   * way into it.
   */
  login: publicProcedure
    .input(z.object({ password: z.string().min(1, "Enter the admin password.") }))
    .mutation(async ({ ctx, input }) => {
      await ensurePanelBootstrapped();
      const adminEmail = await getPanelValue<string>("admin_email");
      if (!adminEmail) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Panel is not initialised." });

      const key = throttleKey(ctx.c);
      checkThrottle(key);
      try {
        // Reuses the platform's own session layer: a correct password issues the
        // same signed cookie every other authenticated request reads.
        const user = await authProvider().login(ctx.c, adminEmail, input.password);
        clearFailures(key);
        return { ok: true as const, email: user.email, name: user.name ?? "Administrator" };
      } catch (e) {
        noteFailure(key);
        if (e instanceof AuthError) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect password." });
        }
        throw e;
      }
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    await authProvider().logout(ctx.c);
    return { ok: true };
  }),

  /** Rotate the console password. Requires the current one. */
  changePassword: panelProcedure
    .input(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8, "Use at least 8 characters.") }))
    .mutation(async ({ ctx, input }) => {
      const adminEmail = await getPanelValue<string>("admin_email");
      if (!adminEmail) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Panel is not initialised." });
      try {
        await authProvider().login(ctx.c, adminEmail, input.currentPassword);
      } catch {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect." });
      }
      await q.setLocalPassword(adminEmail, input.newPassword);
      return { ok: true as const };
    }),
});

// ══════════════════════════════════════════════════════════════════════════════
// Config — the whole game, editable.
// ══════════════════════════════════════════════════════════════════════════════

/** Mask a stored secret so it can be displayed without being disclosed. */
function displayValue(path: string, value: unknown): unknown {
  return isSecretPath(path) && typeof value === "string" && value.length > 0 ? SECRET_MASK : value;
}

/** The password the bridge uses to log in to the GAME's own admin API. */
async function gameAdminPassword(): Promise<string> {
  return (await getPanelValue<string>("game_admin_password")) || ADMIN_PASSWORD;
}

/** Push a set of dotted paths into the live game, best-effort, with a reason on failure. */
async function pushToGame(values: Record<string, unknown>): Promise<{ ok: boolean; error: string | null }> {
  const conn = await q.getConnection();
  const baseUrl = normalizeBaseUrl(conn?.baseUrl ?? "");
  if (!baseUrl) {
    return {
      ok: false,
      error:
        "Saved to the panel — but the game URL is not set yet, so it is not live. Open System → Game connection and paste the game's public URL.",
    };
  }
  if (conn?.enabled === false) {
    return { ok: false, error: "Saved to the panel. Live push is switched off in System → Game connection." };
  }

  // Log in to the game's own admin API. The panel password is what the game's
  // admin API expects; if the game is still on its first-run default, the bridge
  // retries with that so setup is never blocked by ordering.
  const login = await gameAdminLogin(baseUrl, await gameAdminPassword());
  if (!login.ok) return { ok: false, error: login.error };

  const push = await pushConfig(baseUrl, login.data.cookie, values);
  await q.upsertConnection({
    adminCookie: login.data.cookie,
    cookieSavedAt: new Date(),
    lastPushAt: new Date(),
    lastPushOk: push.ok,
    lastPushError: push.ok ? null : push.error,
  });
  return push.ok ? { ok: true, error: null } : { ok: false, error: push.error };
}

const configRouter = router({
  /**
   * Everything the editor needs, in one round trip: the game's own field
   * descriptor, the resolved values, the game's defaults, and — when the game is
   * reachable — what the GAME actually holds right now, so the UI can show which
   * fields are genuinely live.
   */
  overview: panelProcedure.query(async () => {
    const overrides = await q.getOverrides();
    const resolved = resolveConfig(overrides);
    const defaults = DEFAULT_CONFIG as unknown as Record<string, unknown>;

    const values: Record<string, unknown> = {};
    const updatedAt: Record<string, string | null> = {};
    for (const f of CONFIG_FIELDS) {
      const p = f.path as string;
      values[p] = displayValue(p, getPath(resolved as unknown as Record<string, unknown>, p));
      updatedAt[p] = null;
    }
    for (const row of await q.listConfigMeta()) updatedAt[row.path] = row.updatedAt?.toISOString() ?? null;

    // Read the game's live config, best-effort — never fail the page for it.
    const conn = await q.getConnection();
    const baseUrl = normalizeBaseUrl(conn?.baseUrl ?? "");
    let game: {
      reachable: boolean;
      error: string | null;
      outOfSync: { path: string; panel: unknown; game: unknown }[];
    } = { reachable: false, error: null, outOfSync: [] };

    if (baseUrl && conn?.enabled !== false) {
      const login = await gameAdminLogin(baseUrl, await gameAdminPassword());
      if (!login.ok) {
        game = { reachable: false, error: login.error, outOfSync: [] };
      } else {
        const pulled = await pullGameConfig(baseUrl, login.data.cookie);
        if (!pulled.ok) {
          game = { reachable: false, error: pulled.error, outOfSync: [] };
        } else {
          game = { reachable: true, error: null, outOfSync: diffAgainstGame(overrides, pulled.data.overrides) };
          await q.upsertConnection({ adminCookie: login.data.cookie, cookieSavedAt: new Date() });
        }
      }
    }

    return { groups: CONFIG_GROUPS, fields: CONFIG_FIELDS, values, defaults, overrides, updatedAt, game };
  }),

  /** Save any number of fields. Validates EVERY value before writing ANY. */
  save: panelProcedure
    .input(z.object({ values: z.array(z.object({ path: z.string().min(1), value: z.unknown() })) }))
    .mutation(async ({ ctx, input }) => {
      if (input.values.length === 0) return { ok: true as const, saved: [] as string[], push: { ok: true, error: null as string | null } };

      const errors: { path: string; message: string }[] = [];
      const clean: { path: string; value: unknown }[] = [];
      for (const { path, value } of input.values) {
        // A masked secret coming back means "unchanged" — never overwrite a real
        // secret with the placeholder shown in the UI.
        if (isSecretPath(path) && value === SECRET_MASK) continue;
        const result = validateField(path, value);
        if (!result.ok) errors.push({ path, message: result.message });
        else clean.push({ path, value: result.value });
      }
      if (errors.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            `Nothing was saved — ${errors.length} field${errors.length > 1 ? "s" : ""} need fixing: ` +
            errors.map((e) => `${e.path}: ${e.message}`).join(" · "),
        });
      }

      const before = await q.getOverrides();
      const actor = ctx.user.email;
      await q.setOverridesBulk(clean, actor);
      const push = await pushToGame(Object.fromEntries(clean.map((c) => [c.path, c.value])));
      await q.recordAudit(
        clean.map((c) => ({
          path: c.path,
          oldValue: before[c.path] ?? null,
          newValue: c.value,
          action: "set",
          actor,
          pushedToGame: push.ok,
          pushError: push.error,
        })),
      );

      return { ok: true as const, saved: clean.map((c) => c.path), push: { ok: push.ok, error: push.error } };
    }),

  /** Put paths back to the game's shipped defaults (and push that to the game). */
  reset: panelProcedure
    .input(z.object({ paths: z.array(z.string().min(1)).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const actor = ctx.user.email;
      const before = await q.getOverrides();
      const defaults = DEFAULT_CONFIG as unknown as Record<string, unknown>;
      const rows = input.paths.map((path) => {
        const value = getPath(defaults, path);
        if (value === undefined) throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown config path "${path}".` });
        return { path, value };
      });
      await q.setOverridesBulk(rows, actor);
      const push = await pushToGame(Object.fromEntries(rows.map((r) => [r.path, r.value])));
      await q.recordAudit(
        rows.map((r) => ({
          path: r.path,
          oldValue: before[r.path] ?? null,
          newValue: r.value,
          action: "reset",
          actor,
          pushedToGame: push.ok,
          pushError: push.error,
        })),
      );
      return { ok: true as const, reset: rows.map((r) => r.path), push: { ok: push.ok, error: push.error } };
    }),

  /** Send everything the panel holds to the game again (after a URL change, say). */
  pushAll: panelProcedure.mutation(async () => {
    const overrides = await q.getOverrides();
    const push = await pushToGame(overrides);
    await q.recordAudit([
      {
        path: "(all)",
        oldValue: null,
        newValue: null,
        action: "push",
        actor: "system",
        pushedToGame: push.ok,
        pushError: push.error,
      },
    ]);
    return { ok: push.ok, error: push.error, count: Object.keys(overrides).length };
  }),

  history: panelProcedure
    .input(z.object({ limit: z.number().min(1).max(500).optional(), path: z.string().optional() }).optional())
    .query(({ input }) => q.listAudit(input?.limit ?? 200, input?.path)),

  /**
   * THE GAME'S LIVE CONFIG. Public on purpose: the game fetches this at boot and
   * polls it, which is what makes a saved change take effect with no redeploy.
   * Secrets are stripped, and no player data is ever included.
   */
  public: publicProcedure.query(async ({ ctx }) => {
    const overrides = await q.getOverrides();
    const resolved = resolveConfig(overrides);
    // The game fetches this from its OWN origin, so it must be readable
    // cross-origin, and it must never be cached by an intermediary — a stale
    // cached config would look exactly like "my change didn't apply".
    ctx.c.header("cache-control", "no-store, max-age=0");
    ctx.c.header("access-control-allow-origin", "*");
    return {
      config: publicConfig(resolved as unknown as Record<string, unknown>),
      updatedAt: new Date().toISOString(),
    };
  }),
});

// ══════════════════════════════════════════════════════════════════════════════
// Dashboard
// ══════════════════════════════════════════════════════════════════════════════

const dashboardRouter = router({
  stats: panelProcedure.query(async () => {
    const stats = await q.dashboardStats();
    const conn = await q.getConnection();
    const resolved = resolveConfig(await q.getOverrides());
    return {
      ...stats,
      maintenanceMode: resolved.maintenanceMode,
      announcementBanner: resolved.announcementBanner,
      connection: conn
        ? {
            baseUrl: conn.baseUrl,
            enabled: conn.enabled,
            lastPushAt: conn.lastPushAt?.toISOString() ?? null,
            lastPushOk: conn.lastPushOk,
            lastPushError: conn.lastPushError,
            lastCheckAt: conn.lastCheckAt?.toISOString() ?? null,
            lastCheckOk: conn.lastCheckOk,
          }
        : null,
    };
  }),
});

// ══════════════════════════════════════════════════════════════════════════════
// Players, ledger, purchases, withdrawals, tasks
// ══════════════════════════════════════════════════════════════════════════════

const playersRouter = router({
  list: panelProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          page: z.number().int().min(1).optional(),
          pageSize: z.number().int().min(5).max(200).optional(),
          onlyBanned: z.boolean().optional(),
        })
        .optional(),
    )
    .query(({ input }) => q.listPlayers(input ?? {})),

  get: panelProcedure.input(z.object({ userId: z.string().min(1) })).query(({ input }) => q.getPlayer(input.userId)),

  setStatus: panelProcedure
    .input(z.object({ userId: z.string().min(1), status: z.enum(["active", "banned"]) }))
    .mutation(async ({ input }) => {
      const row = await q.setPlayerStatus(input.userId, input.status);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "No such player in the panel's mirror." });
      return { ok: true as const, userId: row.userId, status: row.status };
    }),
});

const moneyRouter = router({
  ledger: panelProcedure
    .input(
      z
        .object({
          userId: z.string().optional(),
          kind: z.string().optional(),
          refType: z.string().optional(),
          from: z.string().optional(),
          to: z.string().optional(),
          page: z.number().int().min(1).optional(),
          pageSize: z.number().int().min(5).max(500).optional(),
        })
        .optional(),
    )
    .query(({ input }) =>
      q.listLedger({
        userId: input?.userId || undefined,
        kind: input?.kind || undefined,
        refType: input?.refType || undefined,
        from: input?.from ? new Date(input.from) : undefined,
        to: input?.to ? new Date(input.to) : undefined,
        page: input?.page,
        pageSize: input?.pageSize,
      }),
    ),

  facets: panelProcedure.query(() => q.ledgerFacets()),

  purchases: panelProcedure
    .input(
      z
        .object({
          status: z.string().optional(),
          payCurrency: z.string().optional(),
          page: z.number().int().min(1).optional(),
          pageSize: z.number().int().min(5).max(200).optional(),
        })
        .optional(),
    )
    .query(({ input }) => q.listPurchases(input ?? {})),

  withdrawals: panelProcedure
    .input(
      z
        .object({
          status: z.string().optional(),
          page: z.number().int().min(1).optional(),
          pageSize: z.number().int().min(5).max(200).optional(),
        })
        .optional(),
    )
    .query(({ input }) => q.listWithdrawals(input ?? {})),

  setWithdrawalStatus: panelProcedure
    .input(
      z.object({
        id: z.string().min(1),
        status: z.enum(["pending", "processing", "approved", "sent", "rejected", "failed"]),
        txHash: z.string().optional(),
        failReason: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await q.setWithdrawalStatus(input.id, input.status, {
        txHash: input.txHash,
        failReason: input.failReason,
        decidedBy: ctx.user.email,
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "No such withdrawal." });
      return { ok: true as const, id: row.id, status: row.status };
    }),

  tasks: panelProcedure
    .input(
      z
        .object({
          status: z.string().optional(),
          page: z.number().int().min(1).optional(),
          pageSize: z.number().int().min(5).max(200).optional(),
        })
        .optional(),
    )
    .query(({ input }) => q.listTaskCompletions(input ?? {})),

  setTaskStatus: panelProcedure
    .input(z.object({ id: z.string().min(1), status: z.enum(["pending", "verified", "rejected"]) }))
    .mutation(async ({ input }) => {
      const row = await q.setTaskCompletionStatus(input.id, input.status);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "No such task completion." });
      return { ok: true as const, id: row.id, status: row.status };
    }),
});

// ══════════════════════════════════════════════════════════════════════════════
// System — the game connection, the ingest token, the public config URL
// ══════════════════════════════════════════════════════════════════════════════

const systemRouter = router({
  connection: panelProcedure.query(async () => {
    const conn = await q.getConnection();
    const token = await getPanelValue<string>(INGEST_TOKEN_KEY);
    return {
      baseUrl: conn?.baseUrl ?? "",
      enabled: conn?.enabled ?? true,
      hasAdminCookie: !!conn?.adminCookie,
      cookieSavedAt: conn?.cookieSavedAt?.toISOString() ?? null,
      lastCheckAt: conn?.lastCheckAt?.toISOString() ?? null,
      lastCheckOk: conn?.lastCheckOk ?? null,
      lastCheckError: conn?.lastCheckError ?? null,
      lastPushAt: conn?.lastPushAt?.toISOString() ?? null,
      lastPushOk: conn?.lastPushOk ?? null,
      lastPushError: conn?.lastPushError ?? null,
      ingestToken: token ?? null,
    };
  }),

  setConnection: panelProcedure
    .input(z.object({ baseUrl: z.string().optional(), enabled: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      await q.upsertConnection(input);
      if (input.baseUrl !== undefined) await setPanelValue(GAME_BASE_URL_KEY, normalizeBaseUrl(input.baseUrl));
      return { ok: true as const, baseUrl: input.baseUrl, enabled: input.enabled };
    }),

  /** Log in to the game with the panel password and report what it says. */
  testConnection: panelProcedure.mutation(async () => {
    const conn = await q.getConnection();
    const baseUrl = normalizeBaseUrl(conn?.baseUrl ?? "");
    if (!baseUrl) {
      await q.upsertConnection({ lastCheckAt: new Date(), lastCheckOk: false, lastCheckError: "No game URL set." });
      return { ok: false, error: "No game URL set yet." };
    }
    const login = await gameAdminLogin(baseUrl, await gameAdminPassword());
    if (!login.ok) {
      await q.upsertConnection({ lastCheckAt: new Date(), lastCheckOk: false, lastCheckError: login.error });
      return { ok: false, error: login.error };
    }
    const pulled = await pullGameConfig(baseUrl, login.data.cookie);
    await q.upsertConnection({
      lastCheckAt: new Date(),
      lastCheckOk: pulled.ok,
      lastCheckError: pulled.ok ? null : pulled.error,
      adminCookie: login.data.cookie,
      cookieSavedAt: new Date(),
    });
    return pulled.ok
      ? { ok: true, error: null as string | null, overrides: Object.keys(pulled.data.overrides).length }
      : { ok: false, error: pulled.error };
  }),

  rotateIngestToken: panelProcedure.mutation(async () => {
    const token = (crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "")).slice(0, 48);
    await setPanelValue(INGEST_TOKEN_KEY, token);
    return { ok: true as const, ingestToken: token };
  }),
});

// ══════════════════════════════════════════════════════════════════════════════
// Ingest — the game pushes its rows in so the panel's views show real data.
// Bearer-token authenticated (no session), because the caller is the game server.
// ══════════════════════════════════════════════════════════════════════════════

async function requireIngestToken(header: string | undefined): Promise<void> {
  const expected = await getPanelValue<string>(INGEST_TOKEN_KEY);
  if (!expected) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Panel is not initialised." });
  if (!header || header !== `Bearer ${expected}`) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid ingest token." });
  }
}

const rowsInput = z.object({
  rows: z.array(z.unknown()).max(2000, "Send at most 2000 rows per call."),
});

const ingestRouter = router({
  push: publicProcedure
    .input(
      z.object({
        players: z.array(z.unknown()).max(2000).optional(),
        ledger: z.array(z.unknown()).max(2000).optional(),
        purchases: z.array(z.unknown()).max(2000).optional(),
        withdrawals: z.array(z.unknown()).max(2000).optional(),
        taskCompletions: z.array(z.unknown()).max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireIngestToken(ctx.c.req.header("authorization"));
      const [players, ledger, purchases, withdrawals, taskCompletions] = await Promise.all([
        q.upsertPlayers((input.players ?? []) as Record<string, unknown>[]),
        q.upsertLedger((input.ledger ?? []) as Record<string, unknown>[]),
        q.upsertPurchases((input.purchases ?? []) as Record<string, unknown>[]),
        q.upsertWithdrawals((input.withdrawals ?? []) as Record<string, unknown>[]),
        q.upsertTaskCompletions((input.taskCompletions ?? []) as Record<string, unknown>[]),
      ]);
      await setPanelValue("last_ingest_at", new Date().toISOString());
      return { ok: true as const, applied: { players, ledger, purchases, withdrawals, taskCompletions } };
    }),

  /** Convenience single-table endpoints, for a game that pushes table by table. */
  players: publicProcedure.input(rowsInput).mutation(async ({ ctx, input }) => {
    await requireIngestToken(ctx.c.req.header("authorization"));
    return { ok: true as const, applied: await q.upsertPlayers(input.rows as Record<string, unknown>[]) };
  }),

  ledger: publicProcedure.input(rowsInput).mutation(async ({ ctx, input }) => {
    await requireIngestToken(ctx.c.req.header("authorization"));
    return { ok: true as const, applied: await q.upsertLedger(input.rows as Record<string, unknown>[]) };
  }),

  purchases: publicProcedure.input(rowsInput).mutation(async ({ ctx, input }) => {
    await requireIngestToken(ctx.c.req.header("authorization"));
    return { ok: true as const, applied: await q.upsertPurchases(input.rows as Record<string, unknown>[]) };
  }),

  withdrawals: publicProcedure.input(rowsInput).mutation(async ({ ctx, input }) => {
    await requireIngestToken(ctx.c.req.header("authorization"));
    return { ok: true as const, applied: await q.upsertWithdrawals(input.rows as Record<string, unknown>[]) };
  }),

  taskCompletions: publicProcedure.input(rowsInput).mutation(async ({ ctx, input }) => {
    await requireIngestToken(ctx.c.req.header("authorization"));
    return { ok: true as const, applied: await q.upsertTaskCompletions(input.rows as Record<string, unknown>[]) };
  }),
});

// ══════════════════════════════════════════════════════════════════════════════
// Retained from the scaffold
// ══════════════════════════════════════════════════════════════════════════════

// Auth: login/logout are provider-agnostic (go through the AuthProvider).
// The panel never calls signup from its UI — the administrator account is created
// server-side at first boot — but the procedure is kept so the platform's error
// mapping stays covered, and it can only ever mint a plain 'user' row: every
// panel procedure is gated on the configured administrator identity.
const authRouter = router({
  me: publicProcedure.query(({ ctx }) => ctx.user),

  signup: publicProcedure
    .input(z.object({ email: z.email(), password: z.string().min(8), name: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const user = await registerLocalUser(input.email, input.password, input.name);
        await authProvider().login(ctx.c, input.email, input.password); // set session cookie
        return user;
      } catch (e: unknown) {
        // CONFLICT, not a 500: the request was well-formed, the address is just
        // taken. registerLocalUser has already turned the driver's SQLSTATE
        // 23505 into this type — never pattern-match a DB error message here,
        // Drizzle hides it behind a "Failed query: <sql>" wrapper.
        if (e instanceof EmailTakenError) throw new TRPCError({ code: "CONFLICT", message: e.message });
        throw e;
      }
    }),

  login: publicProcedure
    .input(z.object({ email: z.email(), password: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await authProvider().login(ctx.c, input.email, input.password);
      } catch (e) {
        if (e instanceof AuthError) throw new TRPCError({ code: "UNAUTHORIZED", message: e.message });
        throw e;
      }
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    await authProvider().logout(ctx.c);
    return { ok: true };
  }),
});

// Sanitize a caller-supplied filename down to a safe key BASENAME: take the
// last path segment (so "/../shared/report.pdf" can't steer the rest of the
// key), keep only [A-Za-z0-9._-], strip leading dots (so a survivor of "." or
// ".." can't slip through as a bare segment), and fall back to a fixed constant
// when nothing survives. Exported so it can be unit-tested directly.
//
// The stem and the extension are sanitized SEPARATELY, and that split is the
// whole point. Sanitizing the basename as one string used to destroy the
// extension of any file whose stem was entirely non-ASCII: the allowlist below
// deleted every CJK character in "风景.png", leaving ".png", and the leading-dot
// strip — there to kill "." / ".." / dotfiles — then ate the extension
// separator, because by that point it was the only dot left. The object landed
// in storage as "<uuid>-png". Splitting first means the leading-dot rule only
// ever sees the stem, where a leading dot really is a dotfile prefix.
export function sanitizeBasename(name: string): string {
  // Split on "\\" too: it cannot steer a path segment (the key joins on "/"),
  // but a Windows path would otherwise fold its directories into the stem.
  const last = name.split(/[/\\]/).pop() ?? "";
  // `> 0`, not `>= 0`: in ".gitignore" the dot is a dotfile prefix, not an
  // extension separator, so the whole name is the stem.
  const dot = last.lastIndexOf(".");
  const rawStem = dot > 0 ? last.slice(0, dot) : last;
  const rawExt = dot > 0 ? last.slice(dot + 1) : "";
  const stem = rawStem.replace(/[^A-Za-z0-9._-]/g, "").replace(/^\.+/, "") || "upload";
  // No dots or separators in an extension, and capped — the key is
  // `${uuid}-${basename}`, so a long tail buys nothing.
  const ext = rawExt.replace(/[^A-Za-z0-9]/g, "").slice(0, 10);
  return ext ? `${stem}.${ext}` : stem;
}

// Example file-upload router. The three-step protocol matters: the browser PUTs
// straight to object storage, so the server only learns the upload succeeded when
// the client calls `commit`. Skipping commit leaves an unindexed orphan object —
// never a row pointing at nothing.
const filesRouter = router({
  uploadUrl: protectedProcedure
    .input(z.object({ name: z.string().min(1), contentType: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const key = `${crypto.randomUUID()}-${sanitizeBasename(input.name)}`;
      try {
        const { uploadUrl, publicPath } = await storagePutUrl(key, input.contentType, {
          ownerId: ctx.user.id,
        });
        return { key, uploadUrl, publicPath };
      } catch (e) {
        if (e instanceof StorageError && e.code === "failed") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "upload rejected by storage — check contentType is on the platform's whitelist " +
              "(see AGENT.md: png/jpeg/gif/webp/avif, pdf, text/plain, csv, json, mpeg/wav audio, mp4/webm video)",
          });
        }
        throw e;
      }
    }),

  commit: protectedProcedure
    .input(z.object({ key: z.string().min(1), name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await storageCommit(input.key, { ownerId: ctx.user.id, name: input.name });
      } catch (e) {
        if (e instanceof StorageError && e.code === "not_found") {
          throw new TRPCError({ code: "NOT_FOUND", message: "upload not found — did the PUT succeed?" });
        }
        if (e instanceof StorageError && e.code === "forbidden") {
          throw new TRPCError({ code: "FORBIDDEN", message: "that key belongs to another user" });
        }
        throw e;
      }
    }),

  list: protectedProcedure.query(({ ctx }) => storageListByOwner(ctx.user.id)),

  remove: protectedProcedure
    .input(z.object({ key: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await storageDeleteOwned(ctx.user.id, input.key);
      } catch (e) {
        if (e instanceof StorageError && e.code === "forbidden") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "malformed key" });
        }
        throw e;
      }
    }),
});

export const appRouter = router({
  auth: authRouter,
  panel: panelRouter,
  config: configRouter,
  dashboard: dashboardRouter,
  players: playersRouter,
  money: moneyRouter,
  system: systemRouter,
  ingest: ingestRouter,
  files: filesRouter,
});

export type AppRouter = typeof appRouter;
