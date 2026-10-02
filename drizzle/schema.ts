import { pgTable, uuid, text, timestamp, index, bigint, integer, boolean, jsonb } from "drizzle-orm/pg-core";

// ──────────────────────────────────────────────────────────────────────────────
// SYSTEM TABLE — managed by the scaffold. The Agent MUST NOT redefine or drop
// the auth columns here; it only ADDS business tables below (DESIGN §5.1).
//
// `password_hash` is LOCAL-auth-only. It is deliberately confined to this table
// and to server/_core/auth.ts — it never appears in SessionUser or any tRPC
// output. This console uses it for its SINGLE administrator row: there is no
// public sign-up, and every panel procedure re-checks the caller against the
// configured administrator before touching data.
// ──────────────────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"), // null for SSO-linked users (future)
  name: text("name"),
  role: text("role").notNull().default("user"), // 'user' | 'admin'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ──────────────────────────────────────────────────────────────────────────────
// SYSTEM TABLE — managed by the scaffold, written by server/_core/storage.ts.
// The Agent MUST NOT redefine, rename or drop it: `_core` inserts into it.
// ──────────────────────────────────────────────────────────────────────────────
export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull().unique(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    contentType: text("content_type"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("files_owner_idx").on(t.ownerId), index("files_created_idx").on(t.createdAt)],
);

// ══════════════════════════════════════════════════════════════════════════════
// TON TAP ARENA — ADMIN CONTROL PANEL
//
// The panel keeps its own authoritative copy of the game's sparse config
// overrides (one row per dotted path, exactly the paths in
// shared/config-schema.ts) and mirrors the game's player/money tables so the
// operator can read them. Writes are pushed to the live game through its own
// `admin.*` tRPC endpoints — see server/services/game-bridge.ts.
// ══════════════════════════════════════════════════════════════════════════════

/** Small key/value store for panel runtime state (admin identity, ingest token). */
export const panelSettings = pgTable("panel_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The editable surface: ONE ROW PER DOTTED CONFIG PATH. This is the panel's
 * authoritative record of what should be live in the game. A missing row means
 * "use the game's default" (shared/config-schema.ts DEFAULT_CONFIG).
 */
export const configValues = pgTable("config_values", {
  path: text("path").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
});

/** Append-only change history: who changed what, from what, to what, and
 *  whether the push into the live game succeeded. */
export const configAudit = pgTable(
  "config_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    path: text("path").notNull(),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    action: text("action").notNull(), // set | reset | bulk
    actor: text("actor").notNull().default("admin"),
    pushedToGame: boolean("pushed_to_game").notNull().default(false),
    pushError: text("push_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("config_audit_created_idx").on(t.createdAt), index("config_audit_path_idx").on(t.path)],
);

/** The live game's connection details and the result of the last talk to it. */
export const gameConnection = pgTable("game_connection", {
  id: text("id").primaryKey().default("default"),
  baseUrl: text("base_url").notNull().default(""),
  enabled: boolean("enabled").notNull().default(true),
  /** The game's own admin session cookie (`tap_arena_admin`), obtained by
   *  logging in to the game's admin API with the same panel password. */
  adminCookie: text("admin_cookie"),
  cookieSavedAt: timestamp("cookie_saved_at", { withTimezone: true }),
  lastCheckAt: timestamp("last_check_at", { withTimezone: true }),
  lastCheckOk: boolean("last_check_ok"),
  lastCheckError: text("last_check_error"),
  lastPushAt: timestamp("last_push_at", { withTimezone: true }),
  lastPushOk: boolean("last_push_ok"),
  lastPushError: text("last_push_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── mirrored player data (the game pushes these in; see /trpc/ingest.push) ──

export const players = pgTable(
  "players",
  {
    userId: text("user_id").primaryKey(),
    handle: text("handle").notNull().default(""),
    avatar: text("avatar"),
    telegramId: text("telegram_id"),
    username: text("username"),
    walletAddress: text("wallet_address"),
    balanceCoin: bigint("balance_coin", { mode: "number" }).notNull().default(0),
    balanceNanoTon: bigint("balance_nano_ton", { mode: "number" }).notNull().default(0),
    vestedNanoTon: bigint("vested_nano_ton", { mode: "number" }).notNull().default(0),
    lockedNanoTon: bigint("locked_nano_ton", { mode: "number" }).notNull().default(0),
    totalTaps: bigint("total_taps", { mode: "number" }).notNull().default(0),
    totalCoinMined: bigint("total_coin_mined", { mode: "number" }).notNull().default(0),
    weekCoinMined: bigint("week_coin_mined", { mode: "number" }).notNull().default(0),
    energy: integer("energy").notNull().default(0),
    tapPowerLevel: integer("tap_power_level").notNull().default(1),
    leagueIndex: integer("league_index").notNull().default(0),
    isPremium: boolean("is_premium").notNull().default(false),
    isAdmin: boolean("is_admin").notNull().default(false),
    isSeed: boolean("is_seed").notNull().default(false),
    referralCode: text("referral_code"),
    referredBy: text("referred_by"),
    referralCount: integer("referral_count").notNull().default(0),
    status: text("status").notNull().default("active"), // active | banned
    createdAt: timestamp("created_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  },
  (t) => [
    index("players_handle_idx").on(t.handle),
    index("players_week_idx").on(t.weekCoinMined),
    index("players_created_idx").on(t.createdAt),
  ],
);

/** Append-only money/coin movement, mirroring the game's ledger. */
export const ledger = pgTable(
  "ledger",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    kind: text("kind").notNull(),
    deltaCoin: bigint("delta_coin", { mode: "number" }).notNull().default(0),
    deltaNanoTon: bigint("delta_nano_ton", { mode: "number" }).notNull().default(0),
    note: text("note").notNull().default(""),
    refType: text("ref_type"),
    refId: text("ref_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ledger_user_idx").on(t.userId, t.createdAt), index("ledger_created_idx").on(t.createdAt)],
);

export const purchases = pgTable(
  "purchases",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    itemSlug: text("item_slug").notNull(),
    itemName: text("item_name").notNull().default(""),
    category: text("category").notNull().default(""),
    tier: text("tier").notNull().default(""),
    priceUsdtCents: integer("price_usdt_cents").notNull().default(0),
    payCurrency: text("pay_currency").notNull().default("TON"),
    amountNanoTon: bigint("amount_nano_ton", { mode: "number" }).notNull().default(0),
    status: text("status").notNull().default("pending"),
    txHash: text("tx_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("purchases_user_idx").on(t.userId, t.createdAt), index("purchases_created_idx").on(t.createdAt)],
);

export const withdrawals = pgTable(
  "withdrawals",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    network: text("network").notNull().default("TON"),
    payoutAddress: text("payout_address").notNull().default(""),
    amountNanoTon: bigint("amount_nano_ton", { mode: "number" }).notNull().default(0),
    feeNanoTon: bigint("fee_nano_ton", { mode: "number" }).notNull().default(0),
    networkFeeNanoTon: bigint("network_fee_nano_ton", { mode: "number" }).notNull().default(0),
    netNanoTon: bigint("net_nano_ton", { mode: "number" }).notNull().default(0),
    status: text("status").notNull().default("pending"),
    txHash: text("tx_hash"),
    failReason: text("fail_reason"),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("withdrawals_user_idx").on(t.userId, t.createdAt), index("withdrawals_status_idx").on(t.status)],
);

export const taskCompletions = pgTable(
  "task_completions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    offerSlug: text("offer_slug").notNull(),
    offerTitle: text("offer_title").notNull().default(""),
    rewardCoin: bigint("reward_coin", { mode: "number" }).notNull().default(0),
    status: text("status").notNull().default("verified"), // pending | verified | rejected
    proofUrl: text("proof_url"),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
  },
  (t) => [index("task_completions_user_idx").on(t.userId), index("task_completions_offer_idx").on(t.offerSlug)],
);
