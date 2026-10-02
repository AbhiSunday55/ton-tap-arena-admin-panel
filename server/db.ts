// ══════════════════════════════════════════════════════════════════════════════
// AGENT-OWNED: business data-access for the admin control panel.
//
// Two kinds of data live here:
//   1. CONFIG — the game's sparse overrides, one row per dotted path. This is
//      the panel's authoritative record of what should be live in the game, and
//      it is what GET /trpc/config.public serves to the game.
//   2. MIRRORED PLAYER DATA — players / ledger / purchases / withdrawals /
//      task completions, pushed in by the game so the operator can read them.
//
// Every function is admin-only at the router layer; nothing here is exposed to
// the public internet except through the explicitly-public config endpoint.
// ══════════════════════════════════════════════════════════════════════════════
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql, sum } from "drizzle-orm";
import { db } from "./_core/db";
import {
  configAudit,
  configValues,
  gameConnection,
  ledger,
  players,
  purchases,
  taskCompletions,
  users,
  withdrawals,
} from "../drizzle/schema";

// ── config ────────────────────────────────────────────────────────────────────

/** Every stored override, as a dotted-path → value map. */
export async function getOverrides(): Promise<Record<string, unknown>> {
  const rows = await db.select().from(configValues);
  const out: Record<string, unknown> = {};
  for (const r of rows) out[r.path] = r.value;
  return out;
}

/** A single stored override, or null when no row exists for that path. */
export async function getOverride(path: string): Promise<unknown | null> {
  const [row] = await db.select().from(configValues).where(eq(configValues.path, path)).limit(1);
  return row ? row.value : null;
}

export async function setOverride(path: string, value: unknown, updatedBy: string): Promise<void> {
  await db
    .insert(configValues)
    .values({ path, value: value as never, updatedBy, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: configValues.path,
      set: { value: value as never, updatedBy, updatedAt: new Date() },
    });
}

export async function setOverridesBulk(entries: { path: string; value: unknown }[], updatedBy: string): Promise<void> {
  if (entries.length === 0) return;
  await db
    .insert(configValues)
    .values(entries.map((e) => ({ path: e.path, value: e.value as never, updatedBy, updatedAt: new Date() })))
    .onConflictDoUpdate({
      target: configValues.path,
      set: {
        value: sql`excluded.value`,
        updatedBy: sql`excluded.updated_by`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}

export async function recordAudit(rows: {
  path: string;
  oldValue: unknown;
  newValue: unknown;
  action: string;
  actor: string;
  pushedToGame?: boolean;
  pushError?: string | null;
}[]): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(configAudit).values(
    rows.map((r) => ({
      path: r.path,
      oldValue: (r.oldValue ?? null) as never,
      newValue: (r.newValue ?? null) as never,
      action: r.action,
      actor: r.actor,
      pushedToGame: r.pushedToGame ?? false,
      pushError: r.pushError ?? null,
    })),
  );
}

export async function listAudit(limit = 200, path?: string) {
  const q = db.select().from(configAudit);
  const rows = path
    ? await q.where(eq(configAudit.path, path)).orderBy(desc(configAudit.createdAt)).limit(limit)
    : await q.orderBy(desc(configAudit.createdAt)).limit(limit);
  return rows;
}

// ── game connection ───────────────────────────────────────────────────────────

export async function getConnection() {
  const [row] = await db.select().from(gameConnection).where(eq(gameConnection.id, "default")).limit(1);
  return row ?? null;
}

export async function upsertConnection(patch: {
  baseUrl?: string;
  enabled?: boolean;
  adminCookie?: string | null;
  cookieSavedAt?: Date | null;
  lastCheckAt?: Date;
  lastCheckOk?: boolean;
  lastCheckError?: string | null;
  lastPushAt?: Date;
  lastPushOk?: boolean;
  lastPushError?: string | null;
}): Promise<void> {
  const { baseUrl, ...rest } = patch;
  await db
    .insert(gameConnection)
    .values({ id: "default", baseUrl: baseUrl ?? "", ...rest, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: gameConnection.id,
      set: { ...(baseUrl === undefined ? {} : { baseUrl }), ...rest, updatedAt: new Date() },
    });
}

// ── dashboard ─────────────────────────────────────────────────────────────────

export async function dashboardStats() {
  const [playerAgg] = await db
    .select({
      total: count(),
      coins: sum(players.balanceCoin),
      nanoTon: sum(players.balanceNanoTon),
      taps: sum(players.totalTaps),
      weekCoins: sum(players.weekCoinMined),
    })
    .from(players);

  const [activeAgg] = await db.select({ n: count() }).from(players).where(eq(players.status, "active"));
  const [bannedAgg] = await db.select({ n: count() }).from(players).where(eq(players.status, "banned"));
  const [premiumAgg] = await db.select({ n: count() }).from(players).where(eq(players.isPremium, true));

  const [pendingWd] = await db
    .select({ n: count(), nano: sum(withdrawals.amountNanoTon) })
    .from(withdrawals)
    .where(inArray(withdrawals.status, ["pending", "processing"]));

  const [wdAgg] = await db.select({ n: count() }).from(withdrawals);
  const [purchAgg] = await db.select({ n: count(), revenueCents: sum(purchases.priceUsdtCents) }).from(purchases);
  const [taskAgg] = await db.select({ n: count() }).from(taskCompletions);
  const [ledgerAgg] = await db.select({ n: count() }).from(ledger);
  const [overrideAgg] = await db.select({ n: count() }).from(configValues);

  const [lastSeen] = await db.select({ at: sql<string | null>`max(${players.lastSeenAt})` }).from(players);

  return {
    players: {
      total: Number(playerAgg?.total ?? 0),
      active: Number(activeAgg?.n ?? 0),
      banned: Number(bannedAgg?.n ?? 0),
      premium: Number(premiumAgg?.n ?? 0),
      coins: Number(playerAgg?.coins ?? 0),
      nanoTon: Number(playerAgg?.nanoTon ?? 0),
      taps: Number(playerAgg?.taps ?? 0),
      weekCoins: Number(playerAgg?.weekCoins ?? 0),
    },
    withdrawals: {
      total: Number(wdAgg?.n ?? 0),
      pending: Number(pendingWd?.n ?? 0),
      pendingNanoTon: Number(pendingWd?.nano ?? 0),
    },
    purchases: { total: Number(purchAgg?.n ?? 0), revenueCents: Number(purchAgg?.revenueCents ?? 0) },
    taskCompletions: Number(taskAgg?.n ?? 0),
    ledgerRows: Number(ledgerAgg?.n ?? 0),
    overrides: Number(overrideAgg?.n ?? 0),
    lastSeenAt: lastSeen?.at ?? null,
  };
}

// ── players ───────────────────────────────────────────────────────────────────

export async function listPlayers(opts: { search?: string; page?: number; pageSize?: number; onlyBanned?: boolean }) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(200, Math.max(5, opts.pageSize ?? 25));
  const search = (opts.search ?? "").trim();

  const filters = [];
  if (search) {
    filters.push(
      or(
        ilike(players.handle, `%${search}%`),
        ilike(players.userId, `%${search}%`),
        ilike(players.username, `%${search}%`),
        ilike(players.walletAddress, `%${search}%`),
        ilike(players.referralCode, `%${search}%`),
      ),
    );
  }
  if (opts.onlyBanned) filters.push(eq(players.status, "banned"));
  const where = filters.length ? and(...filters) : undefined;

  const [totalRow] = await db.select({ n: count() }).from(players).where(where);
  const rows = await db
    .select()
    .from(players)
    .where(where)
    .orderBy(desc(players.weekCoinMined))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { rows, total: Number(totalRow?.n ?? 0), page, pageSize };
}

export async function getPlayer(userId: string) {
  const [player] = await db.select().from(players).where(eq(players.userId, userId)).limit(1);
  if (!player) return null;
  const [ledgerRows, purchaseRows, withdrawalRows, taskRows] = await Promise.all([
    db.select().from(ledger).where(eq(ledger.userId, userId)).orderBy(desc(ledger.createdAt)).limit(50),
    db.select().from(purchases).where(eq(purchases.userId, userId)).orderBy(desc(purchases.createdAt)).limit(50),
    db.select().from(withdrawals).where(eq(withdrawals.userId, userId)).orderBy(desc(withdrawals.createdAt)).limit(50),
    db
      .select()
      .from(taskCompletions)
      .where(eq(taskCompletions.userId, userId))
      .orderBy(desc(taskCompletions.completedAt))
      .limit(50),
  ]);
  return { player, ledger: ledgerRows, purchases: purchaseRows, withdrawals: withdrawalRows, tasks: taskRows };
}

// ── ledger ────────────────────────────────────────────────────────────────────

export async function listLedger(opts: {
  userId?: string;
  kind?: string;
  refType?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(500, Math.max(5, opts.pageSize ?? 50));
  const filters = [];
  if (opts.userId) filters.push(eq(ledger.userId, opts.userId));
  if (opts.kind) filters.push(eq(ledger.kind, opts.kind));
  if (opts.refType) filters.push(eq(ledger.refType, opts.refType));
  if (opts.from) filters.push(gte(ledger.createdAt, opts.from));
  if (opts.to) filters.push(lte(ledger.createdAt, opts.to));
  const where = filters.length ? and(...filters) : undefined;

  const [totalRow] = await db.select({ n: count() }).from(ledger).where(where);
  const rows = await db
    .select()
    .from(ledger)
    .where(where)
    .orderBy(desc(ledger.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { rows, total: Number(totalRow?.n ?? 0), page, pageSize };
}

/** Distinct values so the filters offer real choices, not a guess. */
export async function ledgerFacets() {
  const kinds = await db.selectDistinct({ v: ledger.kind }).from(ledger).orderBy(asc(ledger.kind));
  const refTypes = await db.selectDistinct({ v: ledger.refType }).from(ledger).orderBy(asc(ledger.refType));
  return {
    kinds: kinds.map((k) => k.v).filter((v): v is string => !!v),
    refTypes: refTypes.map((k) => k.v).filter((v): v is string => !!v),
  };
}

// ── purchases ─────────────────────────────────────────────────────────────────

export async function listPurchases(opts: { status?: string; payCurrency?: string; page?: number; pageSize?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(200, Math.max(5, opts.pageSize ?? 50));
  const filters = [];
  if (opts.status) filters.push(eq(purchases.status, opts.status));
  if (opts.payCurrency) filters.push(eq(purchases.payCurrency, opts.payCurrency));
  const where = filters.length ? and(...filters) : undefined;

  const [totalRow] = await db.select({ n: count() }).from(purchases).where(where);
  const rows = await db
    .select()
    .from(purchases)
    .where(where)
    .orderBy(desc(purchases.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { rows, total: Number(totalRow?.n ?? 0), page, pageSize };
}

// ── withdrawals ───────────────────────────────────────────────────────────────

export async function listWithdrawals(opts: { status?: string; page?: number; pageSize?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(200, Math.max(5, opts.pageSize ?? 50));
  const where = opts.status ? eq(withdrawals.status, opts.status) : undefined;

  const [totalRow] = await db.select({ n: count() }).from(withdrawals).where(where);
  const rows = await db
    .select()
    .from(withdrawals)
    .where(where)
    .orderBy(desc(withdrawals.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { rows, total: Number(totalRow?.n ?? 0), page, pageSize };
}

export async function setWithdrawalStatus(
  id: string,
  status: string,
  opts: { txHash?: string; failReason?: string; decidedBy: string },
) {
  const patch: Record<string, unknown> = { status, decidedBy: opts.decidedBy, decidedAt: new Date() };
  if (opts.txHash !== undefined) patch.txHash = opts.txHash;
  if (opts.failReason !== undefined) patch.failReason = opts.failReason;
  const updated = await db.update(withdrawals).set(patch).where(eq(withdrawals.id, id)).returning();
  return updated[0] ?? null;
}

// ── task completions ──────────────────────────────────────────────────────────

export async function listTaskCompletions(opts: { status?: string; page?: number; pageSize?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(200, Math.max(5, opts.pageSize ?? 50));
  const where = opts.status ? eq(taskCompletions.status, opts.status) : undefined;

  const [totalRow] = await db.select({ n: count() }).from(taskCompletions).where(where);
  const rows = await db
    .select()
    .from(taskCompletions)
    .where(where)
    .orderBy(desc(taskCompletions.completedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { rows, total: Number(totalRow?.n ?? 0), page, pageSize };
}

export async function setTaskCompletionStatus(id: string, status: string) {
  const updated = await db
    .update(taskCompletions)
    .set({ status, verifiedAt: status === "verified" ? new Date() : null })
    .where(eq(taskCompletions.id, id))
    .returning();
  return updated[0] ?? null;
}

// ── ingestion (the game pushes its rows in) ───────────────────────────────────

export async function upsertPlayers(rows: Record<string, unknown>[]): Promise<number> {
  if (rows.length === 0) return 0;
  const values = rows.map((r) => ({
    userId: String(r.userId),
    handle: String(r.handle ?? ""),
    avatar: (r.avatar as string) ?? null,
    telegramId: (r.telegramId as string) ?? null,
    username: (r.username as string) ?? null,
    walletAddress: (r.walletAddress as string) ?? null,
    balanceCoin: Number(r.balanceCoin ?? 0),
    balanceNanoTon: Number(r.balanceNanoTon ?? 0),
    vestedNanoTon: Number(r.vestedNanoTon ?? 0),
    lockedNanoTon: Number(r.lockedNanoTon ?? 0),
    totalTaps: Number(r.totalTaps ?? 0),
    totalCoinMined: Number(r.totalCoinMined ?? 0),
    weekCoinMined: Number(r.weekCoinMined ?? 0),
    energy: Number(r.energy ?? 0),
    tapPowerLevel: Number(r.tapPowerLevel ?? 1),
    leagueIndex: Number(r.leagueIndex ?? 0),
    isPremium: Boolean(r.isPremium ?? false),
    isAdmin: Boolean(r.isAdmin ?? false),
    isSeed: Boolean(r.isSeed ?? false),
    referralCode: (r.referralCode as string) ?? null,
    referredBy: (r.referredBy as string) ?? null,
    referralCount: Number(r.referralCount ?? 0),
    status: String(r.status ?? "active"),
    createdAt: r.createdAt ? new Date(r.createdAt as string) : null,
    lastSeenAt: r.lastSeenAt ? new Date(r.lastSeenAt as string) : new Date(),
  }));
  await db
    .insert(players)
    .values(values)
    .onConflictDoUpdate({
      target: players.userId,
      set: {
        handle: sql`excluded.handle`,
        avatar: sql`excluded.avatar`,
        telegramId: sql`excluded.telegram_id`,
        username: sql`excluded.username`,
        walletAddress: sql`excluded.wallet_address`,
        balanceCoin: sql`excluded.balance_coin`,
        balanceNanoTon: sql`excluded.balance_nano_ton`,
        vestedNanoTon: sql`excluded.vested_nano_ton`,
        lockedNanoTon: sql`excluded.locked_nano_ton`,
        totalTaps: sql`excluded.total_taps`,
        totalCoinMined: sql`excluded.total_coin_mined`,
        weekCoinMined: sql`excluded.week_coin_mined`,
        energy: sql`excluded.energy`,
        tapPowerLevel: sql`excluded.tap_power_level`,
        leagueIndex: sql`excluded.league_index`,
        isPremium: sql`excluded.is_premium`,
        isAdmin: sql`excluded.is_admin`,
        isSeed: sql`excluded.is_seed`,
        referralCode: sql`excluded.referral_code`,
        referredBy: sql`excluded.referred_by`,
        referralCount: sql`excluded.referral_count`,
        status: sql`excluded.status`,
        lastSeenAt: sql`excluded.last_seen_at`,
      },
    });
  return values.length;
}

export async function upsertLedger(rows: Record<string, unknown>[]): Promise<number> {
  if (rows.length === 0) return 0;
  const values = rows.map((r) => ({
    id: String(r.id),
    userId: String(r.userId),
    kind: String(r.kind ?? "manual"),
    deltaCoin: Number(r.deltaCoin ?? 0),
    deltaNanoTon: Number(r.deltaNanoTon ?? 0),
    note: String(r.note ?? ""),
    refType: (r.refType as string) ?? null,
    refId: (r.refId as string) ?? null,
    createdAt: r.createdAt ? new Date(r.createdAt as string) : new Date(),
  }));
  await db.insert(ledger).values(values).onConflictDoNothing({ target: ledger.id });
  return values.length;
}

export async function upsertPurchases(rows: Record<string, unknown>[]): Promise<number> {
  if (rows.length === 0) return 0;
  const values = rows.map((r) => ({
    id: String(r.id),
    userId: String(r.userId),
    itemSlug: String(r.itemSlug ?? ""),
    itemName: String(r.itemName ?? ""),
    category: String(r.category ?? ""),
    tier: String(r.tier ?? ""),
    priceUsdtCents: Number(r.priceUsdtCents ?? 0),
    payCurrency: String(r.payCurrency ?? "TON"),
    amountNanoTon: Number(r.amountNanoTon ?? 0),
    status: String(r.status ?? "pending"),
    txHash: (r.txHash as string) ?? null,
    createdAt: r.createdAt ? new Date(r.createdAt as string) : new Date(),
  }));
  await db
    .insert(purchases)
    .values(values)
    .onConflictDoUpdate({
      target: purchases.id,
      set: {
        status: sql`excluded.status`,
        txHash: sql`excluded.tx_hash`,
        amountNanoTon: sql`excluded.amount_nano_ton`,
        priceUsdtCents: sql`excluded.price_usdt_cents`,
      },
    });
  return values.length;
}

export async function upsertWithdrawals(rows: Record<string, unknown>[]): Promise<number> {
  if (rows.length === 0) return 0;
  const values = rows.map((r) => ({
    id: String(r.id),
    userId: String(r.userId),
    network: String(r.network ?? "TON"),
    payoutAddress: String(r.payoutAddress ?? ""),
    amountNanoTon: Number(r.amountNanoTon ?? 0),
    feeNanoTon: Number(r.feeNanoTon ?? 0),
    networkFeeNanoTon: Number(r.networkFeeNanoTon ?? 0),
    netNanoTon: Number(r.netNanoTon ?? 0),
    status: String(r.status ?? "pending"),
    txHash: (r.txHash as string) ?? null,
    failReason: (r.failReason as string) ?? null,
    createdAt: r.createdAt ? new Date(r.createdAt as string) : new Date(),
  }));
  await db
    .insert(withdrawals)
    .values(values)
    .onConflictDoUpdate({
      target: withdrawals.id,
      set: {
        status: sql`excluded.status`,
        txHash: sql`excluded.tx_hash`,
        failReason: sql`excluded.fail_reason`,
        netNanoTon: sql`excluded.net_nano_ton`,
        feeNanoTon: sql`excluded.fee_nano_ton`,
      },
    });
  return values.length;
}

export async function upsertTaskCompletions(rows: Record<string, unknown>[]): Promise<number> {
  if (rows.length === 0) return 0;
  const values = rows.map((r) => ({
    id: String(r.id),
    userId: String(r.userId),
    offerSlug: String(r.offerSlug ?? ""),
    offerTitle: String(r.offerTitle ?? ""),
    rewardCoin: Number(r.rewardCoin ?? 0),
    status: String(r.status ?? "verified"),
    proofUrl: (r.proofUrl as string) ?? null,
    completedAt: r.completedAt ? new Date(r.completedAt as string) : new Date(),
  }));
  await db.insert(taskCompletions).values(values).onConflictDoNothing({ target: taskCompletions.id });
  return values.length;
}

// ── player status ─────────────────────────────────────────────────────────────

export async function setPlayerStatus(userId: string, status: string) {
  const updated = await db.update(players).set({ status }).where(eq(players.userId, userId)).returning();
  return updated[0] ?? null;
}

// ── config metadata (when each path was last written) ─────────────────────────

export async function listConfigMeta() {
  return db
    .select({ path: configValues.path, updatedAt: configValues.updatedAt, updatedBy: configValues.updatedBy })
    .from(configValues);
}

// ── local password ────────────────────────────────────────────────────────────

/**
 * Set the panel administrator's password. This touches ONLY the platform's
 * `users.password_hash` column — the same column _core/auth.ts verifies against
 * — so a rotated password takes effect on the next sign-in with no restart. The
 * hash is produced by bcryptjs, the same library `_core/auth.ts` compares with.
 */
export async function setLocalPassword(email: string, newPassword: string): Promise<void> {
  const { hash } = await import("bcryptjs");
  const passwordHash = await hash(newPassword, 10);
  const updated = await db.update(users).set({ passwordHash }).where(eq(users.email, email.toLowerCase())).returning();
  if (updated.length === 0) throw new Error("Administrator account not found.");
}
