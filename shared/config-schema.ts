// ══════════════════════════════════════════════════════════════════════════════
// VENDORED FROM THE GAME — TON Tap Arena `shared/game-config.ts`.
//
// This is the game's OWN control surface, copied verbatim so the admin panel's
// controls can never drift from the values the game actually reads. The game
// stores sparse overrides as dotted paths in its `settings` table and layers
// them with `resolveConfig()`; this panel writes the very same dotted paths
// through the game's `admin.setConfigBulk` endpoint, so a save needs no
// migration and no redeploy.
//
// Keep this file byte-compatible with the game's copy. `CONFIG_FIELDS` is what
// the editor renders from, so adding a tunable to the game is the only step
// needed for it to appear here.
// ══════════════════════════════════════════════════════════════════════════════

export const NANO = 1_000_000_000; // 1 TON in nanoTON

export interface ReferralRung {
  name: string;
  friends: number;
  bonusTon: number;
}

export interface GameConfig {
  // ── identity & treasury ──
  appName: string;
  announcementBanner: string;
  maintenanceMode: boolean;
  /** Canonical treasury identifier — the EVM address the spec fixes. */
  treasureEvmAddress: string;
  /**
   * TON-format (32-byte) treasury address. EMPTY BY DEFAULT on purpose: the
   * supplied treasury is a 20-byte EVM address and TON transfers cannot be sent
   * to it. While this is empty the server REFUSES to broadcast a TON transfer.
   */
  treasureTonAddress: string;

  // ── economy ──
  startingCoin: number;
  startingTon: number;
  coinsPerTon: number;
  tonUsdRate: number;
  usdtTonRate: number;

  // ── tap to mine ──
  energyCap: number;
  energyRegenSeconds: number;
  tapBaseReward: number;
  tapPowerUpgradeCost: number;
  tapPowerUpgradeStep: number;
  tapPowerUpgradeMax: number;
  comboWindowMs: number;
  comboStepPercent: number;
  comboMaxMultiplier: number;
  tapBatchMax: number;

  // ── boosters ──
  turboMultiplier: number;
  turboDurationSec: number;
  turboFreePerDay: number;
  turboCostCoin: number;
  energyRefillFreePerDay: number;
  energyRefillCostCoin: number;
  rechargeFreePerDay: number;
  rechargeAmount: number;
  rechargeCooldownSec: number;
  rechargeCostCoin: number;

  // ── leagues (5 tiers) ──
  leagueNames: string[];
  leagueThresholds: number[];
  leagueMultipliers: number[];
  leagueEmojis: string[];

  // ── daily streak (10 days) ──
  streakRewards: number[];

  // ── mining rigs ──
  rigs: { name: string; costCoin: number; perHour: number }[];

  // ── withdrawal ──
  withdrawThresholdTon: number;
  withdrawFeePercent: number;
  withdrawNetworkFeeTon: number;
  vestedPercent: number;
  withdrawDailyLimitTon: number;

  // ── referrals ──
  referralRewardCoin: number;
  referralPremiumMultiplier: number;
  referralRevenueSharePercent: number;
  referralLadder: ReferralRung[];

  // ── shop ──
  shopPriceBaseUsdt: number;
  shopTierMultiplier: number;
  shopCoinMultiplier: number;

  // ── ads ──
  adEnabled: boolean;
  adProvider: string;
  /** Adsgram block ID (their dashboard calls it a block, not a unit). */
  adUnitId: string;
  adLink: string;
  adRewardCoin: number;
  adDailyLimit: number;
  adWatchSeconds: number;

  // ── Telegram Mini App ──
  telegramBotToken: string;
  telegramBotUsername: string;
  telegramWebhookSecret: string;
  telegramMiniAppUrl: string;
  telegramLoginEnabled: boolean;

  // ── leaderboard ──
  leaderboardSize: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  appName: "TON Tap Arena",
  announcementBanner: "",
  maintenanceMode: false,
  treasureEvmAddress: "0x24170ba189134922d1606c9C0F13D75d1B40CA35",
  treasureTonAddress: "",

  startingCoin: 1000,
  startingTon: 0.1,
  coinsPerTon: 100_000,
  tonUsdRate: 5.5,
  usdtTonRate: 5.5,

  energyCap: 1000,
  energyRegenSeconds: 3,
  tapBaseReward: 1,
  tapPowerUpgradeCost: 50_000,
  tapPowerUpgradeStep: 1,
  tapPowerUpgradeMax: 20,
  comboWindowMs: 1400,
  comboStepPercent: 10,
  comboMaxMultiplier: 2,
  tapBatchMax: 60,

  turboMultiplier: 5,
  turboDurationSec: 20,
  turboFreePerDay: 3,
  turboCostCoin: 20_000,
  energyRefillFreePerDay: 3,
  energyRefillCostCoin: 15_000,
  rechargeFreePerDay: 6,
  rechargeAmount: 500,
  rechargeCooldownSec: 3600,
  rechargeCostCoin: 10_000,

  leagueNames: ["Bronze", "Silver", "Gold", "Platinum", "Diamond"],
  leagueThresholds: [0, 50_000, 250_000, 1_000_000, 5_000_000],
  leagueMultipliers: [1, 1.5, 2, 2.5, 3],
  leagueEmojis: ["🥉", "🥈", "🥇", "💎", "👑"],

  streakRewards: [500, 1200, 2500, 5000, 10_000, 25_000, 60_000, 150_000, 500_000, 5_000_000],

  rigs: [
    { name: "Scrap Rig", costCoin: 5_000, perHour: 40 },
    { name: "Steel Rig", costCoin: 25_000, perHour: 120 },
    { name: "Plasma Rig", costCoin: 120_000, perHour: 320 },
    { name: "Quantum Rig", costCoin: 600_000, perHour: 720 },
  ],

  withdrawThresholdTon: 5,
  withdrawFeePercent: 2,
  withdrawNetworkFeeTon: 0.01,
  vestedPercent: 11.25,
  withdrawDailyLimitTon: 100,

  referralRewardCoin: 5000,
  referralPremiumMultiplier: 5,
  referralRevenueSharePercent: 10,
  referralLadder: [
    { name: "Bronze", friends: 3, bonusTon: 0.5 },
    { name: "Silver", friends: 10, bonusTon: 0.75 },
    { name: "Gold", friends: 25, bonusTon: 1 },
    { name: "Diamond", friends: 50, bonusTon: 1.25 },
  ],

  shopPriceBaseUsdt: 0.5,
  shopTierMultiplier: 2,
  shopCoinMultiplier: 100_000,

  adEnabled: true,
  adProvider: "adsgram",
  adUnitId: "int-51466",
  adLink: "https://example.com/replace-with-your-ad-network",
  adRewardCoin: 2500,
  adDailyLimit: 5,
  adWatchSeconds: 15,

  telegramBotToken: "",
  telegramBotUsername: "",
  telegramWebhookSecret: "",
  telegramMiniAppUrl: "",
  telegramLoginEnabled: true,

  leaderboardSize: 50,
};

// ── Admin editor descriptor (the game's own). One entry per editable path. ──
export type FieldType = "number" | "percent" | "ton" | "usdt" | "text" | "url" | "bool" | "numberlist" | "json";

export interface ConfigField {
  path: keyof GameConfig;
  label: string;
  group: string;
  type: FieldType;
  step?: number;
  min?: number;
  max?: number;
  help?: string;
}

export const CONFIG_GROUPS = [
  "Identity & Treasury",
  "Economy",
  "Tap & Energy",
  "Boosters",
  "Leagues",
  "Daily Streak",
  "Mining Rigs",
  "Withdrawal",
  "Referrals",
  "Shop",
  "Ads",
  "Telegram",
  "Leaderboard",
] as const;

export const CONFIG_FIELDS: ConfigField[] = [
  { path: "appName", label: "App name", group: "Identity & Treasury", type: "text" },
  {
    path: "announcementBanner",
    label: "Announcement banner",
    group: "Identity & Treasury",
    type: "text",
    help: "Shown as a strip at the top of every screen. Empty = hidden.",
  },
  { path: "maintenanceMode", label: "Maintenance mode", group: "Identity & Treasury", type: "bool" },
  {
    path: "treasureEvmAddress",
    label: "Treasury — canonical EVM address",
    group: "Identity & Treasury",
    type: "text",
    help: "Audit reference and USDT settlement identifier.",
  },
  {
    path: "treasureTonAddress",
    label: "Treasury — TON address",
    group: "Identity & Treasury",
    type: "text",
    help: "TON-format (32-byte, EQ…/UQ…/0:hex) address that receives TON. While empty, real TON broadcasts are REFUSED and orders fall back to the off-chain ledger.",
  },

  { path: "startingCoin", label: "Starting coin", group: "Economy", type: "number", min: 0 },
  { path: "startingTon", label: "Starting TON reward", group: "Economy", type: "ton", step: 0.01, min: 0 },
  { path: "coinsPerTon", label: "Coins per 1 TON", group: "Economy", type: "number", min: 1 },
  { path: "tonUsdRate", label: "TON price (USD)", group: "Economy", type: "number", step: 0.01, min: 0 },
  {
    path: "usdtTonRate",
    label: "TON per 1 USDT",
    group: "Economy",
    type: "number",
    step: 0.01,
    min: 0.0001,
    help: "Converts a USD shop price into a TON amount for on-chain checkout.",
  },

  { path: "energyCap", label: "Energy cap", group: "Tap & Energy", type: "number", min: 1 },
  { path: "energyRegenSeconds", label: "Seconds per 1 energy", group: "Tap & Energy", type: "number", step: 0.5, min: 0.1 },
  { path: "tapBaseReward", label: "Base coin per tap", group: "Tap & Energy", type: "number", min: 0 },
  { path: "tapPowerUpgradeCost", label: "Tap-power upgrade cost (coin)", group: "Tap & Energy", type: "number", min: 0 },
  { path: "tapPowerUpgradeStep", label: "Tap power per upgrade", group: "Tap & Energy", type: "number", min: 1 },
  { path: "tapPowerUpgradeMax", label: "Tap power max level", group: "Tap & Energy", type: "number", min: 1 },
  { path: "comboWindowMs", label: "Combo window (ms)", group: "Tap & Energy", type: "number", min: 0 },
  { path: "comboStepPercent", label: "Combo step (%)", group: "Tap & Energy", type: "percent", min: 0 },
  { path: "comboMaxMultiplier", label: "Combo max multiplier", group: "Tap & Energy", type: "number", step: 0.1, min: 1 },
  { path: "tapBatchMax", label: "Max taps per batch", group: "Tap & Energy", type: "number", min: 1 },

  { path: "turboMultiplier", label: "Turbo multiplier", group: "Boosters", type: "number", step: 0.5, min: 1 },
  { path: "turboDurationSec", label: "Turbo duration (s)", group: "Boosters", type: "number", min: 1 },
  { path: "turboFreePerDay", label: "Turbo free / day", group: "Boosters", type: "number", min: 0 },
  { path: "turboCostCoin", label: "Turbo cost when exhausted (coin)", group: "Boosters", type: "number", min: 0 },
  { path: "energyRefillFreePerDay", label: "Full-energy free / day", group: "Boosters", type: "number", min: 0 },
  { path: "energyRefillCostCoin", label: "Full-energy cost (coin)", group: "Boosters", type: "number", min: 0 },
  { path: "rechargeFreePerDay", label: "Recharge free / day", group: "Boosters", type: "number", min: 0 },
  { path: "rechargeAmount", label: "Recharge energy amount", group: "Boosters", type: "number", min: 0 },
  { path: "rechargeCooldownSec", label: "Recharge cooldown (s)", group: "Boosters", type: "number", min: 0 },
  { path: "rechargeCostCoin", label: "Recharge cost (coin)", group: "Boosters", type: "number", min: 0 },

  { path: "leagueNames", label: "League names", group: "Leagues", type: "json", help: 'JSON array, e.g. ["Bronze", …] — 5 entries.' },
  { path: "leagueEmojis", label: "League emojis", group: "Leagues", type: "json", help: "JSON array — 5 entries." },
  { path: "leagueThresholds", label: "League thresholds (coin mined)", group: "Leagues", type: "numberlist", help: "Comma separated — 5 ascending values." },
  { path: "leagueMultipliers", label: "League tap multipliers", group: "Leagues", type: "numberlist", help: "Comma separated — 5 values." },

  { path: "streakRewards", label: "Day 1–10 streak rewards", group: "Daily Streak", type: "numberlist", help: "Comma separated — 10 ascending coin amounts." },

  { path: "rigs", label: "Mining rigs", group: "Mining Rigs", type: "json", help: "JSON array of {name, costCoin, perHour}." },

  { path: "withdrawThresholdTon", label: "Withdrawal threshold (TON)", group: "Withdrawal", type: "ton", step: 0.1, min: 0 },
  { path: "withdrawFeePercent", label: "Platform fee (%)", group: "Withdrawal", type: "percent", min: 0, max: 50 },
  { path: "withdrawNetworkFeeTon", label: "Network fee (TON)", group: "Withdrawal", type: "ton", step: 0.001, min: 0 },
  { path: "vestedPercent", label: "Vested portion (%)", group: "Withdrawal", type: "percent", min: 0, max: 100 },
  { path: "withdrawDailyLimitTon", label: "Daily withdrawal cap (TON)", group: "Withdrawal", type: "ton", min: 0 },

  { path: "referralRewardCoin", label: "Coin per referral", group: "Referrals", type: "number", min: 0 },
  { path: "referralPremiumMultiplier", label: "Premium multiplier", group: "Referrals", type: "number", step: 0.5, min: 1 },
  { path: "referralRevenueSharePercent", label: "Revenue share (%)", group: "Referrals", type: "percent", min: 0, max: 50 },
  { path: "referralLadder", label: "Referral ladder", group: "Referrals", type: "json", help: "JSON array of {name, friends, bonusTon}." },

  { path: "shopPriceBaseUsdt", label: "Base price (USDT)", group: "Shop", type: "usdt", step: 0.05, min: 0 },
  { path: "shopTierMultiplier", label: "Tier price multiplier", group: "Shop", type: "number", step: 0.5, min: 1, help: "price = base × multiplier^tierIndex" },
  { path: "shopCoinMultiplier", label: "Coin price multiplier", group: "Shop", type: "number", min: 0, help: "coinPrice = baseUsd × coinMultiplier × tierMultiplier^tierIndex" },

  { path: "adEnabled", label: "Ads enabled", group: "Ads", type: "bool" },
  {
    path: "adProvider",
    label: "Ad network",
    group: "Ads",
    type: "text",
    help: "`adsgram` uses the real Adsgram SDK (requires a block ID below and the SDK in the Mini App). `placeholder` runs the built-in simulated slot.",
  },
  {
    path: "adUnitId",
    label: "Adsgram block ID",
    group: "Ads",
    type: "text",
    help: "From the Adsgram dashboard, e.g. `1234` or `task-1234`. Paste it here to switch the slot over to real ads.",
  },
  { path: "adLink", label: "Ad destination URL", group: "Ads", type: "url", help: "Where the placeholder slot points. Adsgram serves its own creatives." },
  { path: "adRewardCoin", label: "Coin per ad view", group: "Ads", type: "number", min: 0 },
  { path: "adDailyLimit", label: "Ad views per day", group: "Ads", type: "number", min: 0 },
  { path: "adWatchSeconds", label: "Required watch time (s)", group: "Ads", type: "number", min: 0 },

  { path: "leaderboardSize", label: "Leaderboard rows", group: "Leaderboard", type: "number", min: 5, max: 200 },

  {
    path: "telegramBotToken",
    label: "Bot token (secret)",
    group: "Telegram",
    type: "text",
    help: "Server-side only — never sent to a browser. Leave the masked value untouched to keep the current token. Empty falls back to the TELEGRAM_BOT_TOKEN env var.",
  },
  {
    path: "telegramBotUsername",
    label: "Bot username",
    group: "Telegram",
    type: "text",
    help: "Public @handle, without the @.",
  },
  {
    path: "telegramWebhookSecret",
    label: "Webhook secret (secret)",
    group: "Telegram",
    type: "text",
    help: "Secret token Telegram echoes back on every webhook call, so a forged update can be rejected. Masked like the bot token.",
  },
  {
    path: "telegramMiniAppUrl",
    label: "Mini App URL",
    group: "Telegram",
    type: "url",
    help: "Public https URL of this app. Used for the menu button and the webhook.",
  },
  { path: "telegramLoginEnabled", label: "Allow Telegram sign-in", group: "Telegram", type: "bool" },
];

/** Config paths that must NEVER reach a client in full. */
export const SECRET_CONFIG_PATHS = ["telegramBotToken", "telegramWebhookSecret"] as const;

/** Placeholder shown to an operator in place of a stored secret. Sending this
 *  back in a save means "unchanged". */
export const SECRET_MASK = "••••••••••••••••";

export function isSecretPath(path: string): boolean {
  return (SECRET_CONFIG_PATHS as readonly string[]).includes(path);
}

/** Strip secrets from a config object bound for a non-admin client. */
export function publicConfig<T extends Record<string, unknown>>(cfg: T): Record<string, unknown> {
  const clone = { ...cfg } as Record<string, unknown>;
  for (const p of SECRET_CONFIG_PATHS) delete clone[p];
  return clone;
}

/** Dotted-path get/set on a plain object. */
export function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => {
    if (acc === null || acc === undefined) return undefined;
    return (acc as Record<string, unknown>)[k];
  }, obj);
}

export function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i]!;
    if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

/**
 * Layer sparse admin overrides (one row per dotted path) over the defaults.
 * An override whose value no longer parses is ignored rather than crashing.
 */
export function resolveConfig(overrides: Record<string, unknown> | undefined | null): GameConfig {
  const out = structuredClone(DEFAULT_CONFIG) as unknown as Record<string, unknown>;
  if (overrides) {
    for (const [path, value] of Object.entries(overrides)) {
      if (value === undefined) continue;
      setPath(out, path, value);
    }
  }
  return out as unknown as GameConfig;
}

// ── validation ───────────────────────────────────────────────────────────────
export type ValidationResult = { ok: true; value: unknown } | { ok: false; message: string };

const ALL_CONFIG_PATHS = new Set<string>(CONFIG_FIELDS.map((f) => f.path as string));

export function isEditablePath(path: string): boolean {
  return ALL_CONFIG_PATHS.has(path);
}

export function fieldFor(path: string): ConfigField | undefined {
  return CONFIG_FIELDS.find((f) => (f.path as string) === path);
}

export function defaultValueFor(path: string): unknown {
  return getPath(DEFAULT_CONFIG as unknown as Record<string, unknown>, path);
}

/**
 * Validate a value against the game's own field descriptor before it can reach
 * the database or the game. Mirrors the game's own coercion so what the panel
 * accepts is exactly what the game can run.
 */
export function validateField(path: string, raw: unknown): ValidationResult {
  const field = fieldFor(path);
  if (!field) return { ok: false, message: `Unknown config path "${path}".` };

  switch (field.type) {
    case "bool": {
      if (typeof raw === "boolean") return { ok: true, value: raw };
      if (raw === "true" || raw === "false") return { ok: true, value: raw === "true" };
      return { ok: false, message: `${field.label} must be true or false.` };
    }
    case "number":
    case "percent":
    case "ton":
    case "usdt": {
      const n = typeof raw === "number" ? raw : Number(String(raw).trim());
      if (!Number.isFinite(n)) return { ok: false, message: `${field.label} must be a number.` };
      if (field.min !== undefined && n < field.min) return { ok: false, message: `${field.label} must be at least ${field.min}.` };
      if (field.max !== undefined && n > field.max) return { ok: false, message: `${field.label} must be at most ${field.max}.` };
      return { ok: true, value: n };
    }
    case "text":
    case "url": {
      const s = typeof raw === "string" ? raw : String(raw);
      if (field.type === "url" && s.length > 0 && !/^https?:\/\//i.test(s)) {
        return { ok: false, message: `${field.label} must start with http:// or https:// (or be empty).` };
      }
      return { ok: true, value: s };
    }
    case "numberlist": {
      if (!Array.isArray(raw)) {
        return { ok: false, message: `${field.label} must be a JSON array of numbers.` };
      }
      const nums: number[] = [];
      for (const item of raw) {
        const n = typeof item === "number" ? item : Number(String(item).trim());
        if (!Number.isFinite(n)) return { ok: false, message: `${field.label} contains a value that is not a number.` };
        nums.push(n);
      }
      return { ok: true, value: nums };
    }
    case "json": {
      // Structured rows are validated by shape per known path.
      const check = validateStructured(field, raw);
      return check;
    }
    default:
      return { ok: false, message: `Unsupported field type for ${field.label}.` };
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateStructured(field: ConfigField, raw: unknown): ValidationResult {
  switch (field.path) {
    case "rigs": {
      if (!Array.isArray(raw)) return { ok: false, message: "Mining rigs must be an array." };
      const rows: { name: string; costCoin: number; perHour: number }[] = [];
      for (const [i, r] of raw.entries()) {
        if (!isPlainObject(r)) return { ok: false, message: `Rig #${i + 1} must be an object.` };
        const name = String(r.name ?? "").trim();
        const costCoin = Number(r.costCoin);
        const perHour = Number(r.perHour);
        if (!name) return { ok: false, message: `Rig #${i + 1} needs a name.` };
        if (!Number.isFinite(costCoin) || costCoin < 0) return { ok: false, message: `Rig "${name}" needs a non-negative cost.` };
        if (!Number.isFinite(perHour) || perHour < 0) return { ok: false, message: `Rig "${name}" needs a non-negative hourly rate.` };
        rows.push({ name, costCoin, perHour });
      }
      return { ok: true, value: rows };
    }
    case "referralLadder": {
      if (!Array.isArray(raw)) return { ok: false, message: "Referral ladder must be an array." };
      const rows: ReferralRung[] = [];
      for (const [i, r] of raw.entries()) {
        if (!isPlainObject(r)) return { ok: false, message: `Ladder rung #${i + 1} must be an object.` };
        const name = String(r.name ?? "").trim();
        const friends = Number(r.friends);
        const bonusTon = Number(r.bonusTon);
        if (!name) return { ok: false, message: `Ladder rung #${i + 1} needs a name.` };
        if (!Number.isFinite(friends) || friends < 0) return { ok: false, message: `Rung "${name}" needs a non-negative friend count.` };
        if (!Number.isFinite(bonusTon) || bonusTon < 0) return { ok: false, message: `Rung "${name}" needs a non-negative TON bonus.` };
        rows.push({ name, friends, bonusTon });
      }
      return { ok: true, value: rows };
    }
    case "leagueNames":
    case "leagueEmojis": {
      if (!Array.isArray(raw)) return { ok: false, message: `${field.label} must be a JSON array.` };
      const out = raw.map((v) => String(v));
      if (out.length !== 5) return { ok: false, message: `${field.label} needs exactly 5 entries (the game has 5 leagues).` };
      return { ok: true, value: out };
    }
    default:
      return { ok: true, value: raw };
  }
}

// ── formatting helpers shared with the game ──
export function nanoToTon(nano: number): number {
  return nano / NANO;
}

export function tonToNano(ton: number): number {
  return Math.round(ton * NANO);
}

export function fmtNum(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtCoin(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}K`;
  return fmtNum(n);
}
