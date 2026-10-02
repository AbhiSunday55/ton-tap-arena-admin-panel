import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { makeCaller } from "./_core/test-caller";

// Full rationale for what gets mocked below (and why ./_core/trpc doesn't
// need to be) lives on server/_core/test-caller.ts, next to makeCaller —
// mock every _core module routers.ts touches.
vi.mock("./_core/auth", () => {
  class AuthError extends Error {}
  return {
    authProvider: () => ({ login: vi.fn(), logout: vi.fn(), getSession: vi.fn() }),
    registerLocalUser: vi.fn(),
    AuthError,
    EmailTakenError: class EmailTakenError extends AuthError {},
  };
});

vi.mock("./_core/storage", () => ({
  storageCommit: vi.fn(),
  storageDeleteOwned: vi.fn(),
  storageListByOwner: vi.fn(),
  storagePutUrl: vi.fn(),
  StorageError: class StorageError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock("./db", () => ({
  listItemsByOwner: vi.fn(),
  createItem: vi.fn(),
  deleteItem: vi.fn(),
}));

// The panel guard reads the administrator's identity from the panel store, and
// the config write path talks to the game over HTTP. Both are mocked for the
// same reason as ./auth and ./storage: they reach _core/db at module load, which
// needs env.databaseUrl. Only the "admin_email" key resolves, so the guard's
// allow path and its deny path are both reachable from a test.
const ADMIN_EMAIL = "admin@ton-tap-arena.local";
vi.mock("./_core/panel-store", () => ({
  getPanelValue: vi.fn(async (k: string) => (k === "admin_email" ? ADMIN_EMAIL : null)),
  setPanelValue: vi.fn(),
}));

vi.mock("./services/game-bridge", () => ({
  gameAdminLogin: vi.fn(),
  pushConfig: vi.fn(),
  pullGameConfig: vi.fn(),
  diffAgainstGame: vi.fn(() => []),
  normalizeBaseUrl: (u: string) => (u ?? "").trim().replace(/\/+$/, ""),
}));

const { sanitizeBasename } = await import("./routers");
const { storageDeleteOwned, StorageError } = await import("./_core/storage");
const { registerLocalUser, EmailTakenError } = await import("./_core/auth");

// C1c: uploadUrl's key is `${uuid}-${sanitizeBasename(name)}`. The uuid prefix
// only makes the key unguessable if the REST of the key isn't
// attacker-controlled — sanitizeBasename is what stops a caller-supplied
// `name` like "/../report.pdf" from steering path segments into someone
// else's key (which canonicalKey in storage.ts would then reject outright,
// but the point of sanitizing here is to never construct that key at all).
describe("sanitizeBasename", () => {
  it("passes a normal filename through unchanged", () => {
    expect(sanitizeBasename("report.pdf")).toBe("report.pdf");
  });

  it("takes only the last path segment, dropping any directory traversal", () => {
    expect(sanitizeBasename("/../report.pdf")).toBe("report.pdf");
    expect(sanitizeBasename("a/b/../evil.png")).toBe("evil.png");
    expect(sanitizeBasename("../../etc/passwd")).toBe("passwd");
  });

  it("strips characters outside [A-Za-z0-9._-]", () => {
    expect(sanitizeBasename("my file (final)!.png")).toBe("myfilefinal.png");
    expect(sanitizeBasename("héllo.png")).toBe("hllo.png");
  });

  it("collapses leading dots so a bare '.' or '..' basename can't survive", () => {
    expect(sanitizeBasename("..")).toBe("upload");
    expect(sanitizeBasename(".")).toBe("upload");
    // "upload.hidden", not "hidden": the leading dots are still gone (that is
    // the security property), but the last dot is now read as the extension
    // separator rather than deleted along with them.
    expect(sanitizeBasename("...hidden")).toBe("upload.hidden");
  });

  // Regression (observed 2026-08, published app gallery-app-gpkd51ak): a file
  // named 风景.png landed in storage as "<uuid>-png" — no dot, no extension.
  // Two rules compounded. The allowlist is ASCII-only, so a stem written
  // entirely in CJK is deleted, leaving ".png"; the leading-dot strip that
  // follows then ate the dot, because by that point the only dot left in the
  // string is the extension separator, not a dotfile prefix.
  //
  // The trigger is a stem with NO surviving ASCII, which is the common case for
  // Chinese/Japanese/Korean filenames — "微信图片_2026.png" was always fine,
  // because "_2026" survives and keeps a stem in front of the dot. That is why
  // this went unnoticed.
  it("keeps the extension when the stem is entirely non-ASCII", () => {
    expect(sanitizeBasename("风景.png")).toBe("upload.png");
    expect(sanitizeBasename("日本語.jpeg")).toBe("upload.jpeg");
    expect(sanitizeBasename("한글.png")).toBe("upload.png");
    expect(sanitizeBasename("相册/风景.png")).toBe("upload.png");
  });

  it("keeps the extension on names that already sanitized cleanly", () => {
    expect(sanitizeBasename("微信图片_2026.png")).toBe("_2026.png");
    expect(sanitizeBasename("IMG_1234.PNG")).toBe("IMG_1234.PNG");
    expect(sanitizeBasename("archive.tar.gz")).toBe("archive.tar.gz");
  });

  // A dotfile has no extension to preserve — the whole name is the stem.
  it("treats a leading-dot name as a stem, not as a bare extension", () => {
    expect(sanitizeBasename(".png")).toBe("png");
    expect(sanitizeBasename(".gitignore")).toBe("gitignore");
  });

  // The key is `${uuid}-${basename}`, so a "/" or "\\" surviving here would
  // steer path segments; an over-long extension would pad the key for no gain.
  it("never emits a path separator, and caps the extension", () => {
    expect(sanitizeBasename("C:\\photos\\风景.png")).toBe("upload.png");
    expect(sanitizeBasename("x." + "a".repeat(40))).toBe("x." + "a".repeat(10));
  });

  it("falls back to a constant when nothing survives sanitization", () => {
    expect(sanitizeBasename("???")).toBe("upload");
    expect(sanitizeBasename("")).toBe("upload");
    expect(sanitizeBasename("///")).toBe("upload");
  });
});

// C1d (regression): storageDeleteOwned runs the key through canonicalKey,
// which throws StorageError("forbidden") for a malformed key (e.g. a
// "../"-traversal segment) BEFORE any db/network access. files.remove had no
// try/catch, so that throw used to escape as a raw StorageError, which tRPC
// wraps as an opaque INTERNAL_SERVER_ERROR (500) for what is plainly bad
// client input. Exercise the real router (only auth/storage/db are mocked —
// ./_core/trpc is real) via makeCaller so this asserts the actual error the
// client would receive, not a re-implementation of the mapping.
describe("files.remove", () => {
  it("maps a malformed key (StorageError forbidden) to TRPCError BAD_REQUEST, not a raw throw", async () => {
    vi.mocked(storageDeleteOwned).mockRejectedValueOnce(
      new StorageError("unsafe storage key (diverges from platform normalization): ../evil.pdf", "forbidden"),
    );
    const caller = makeCaller({
      c: {} as never,
      db: {} as never,
      user: { id: "user-1" } as never,
    });

    const err = await caller.files.remove({ key: "../evil.pdf" }).catch((e) => e);

    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe("BAD_REQUEST");
  });
});

// Regression (observed 2026-08-26, published app): signing up twice with the
// same email answered 500 INTERNAL_SERVER_ERROR whose message was the raw
// Drizzle failure — the INSERT statement plus every bound param, bcrypt hash
// included — which the signup form then printed at the user. The mapping now
// hangs off a type (EmailTakenError from _core/auth), not a regex over a
// driver-specific message.
describe("auth.signup", () => {
  const anonymous = { c: {} as never, db: {} as never, user: null };

  it("maps an already-registered email to TRPCError CONFLICT, not a 500", async () => {
    vi.mocked(registerLocalUser).mockRejectedValueOnce(
      new EmailTakenError("That email is already registered — try logging in instead."),
    );
    const caller = makeCaller(anonymous);

    const err = await caller.auth
      .signup({ email: "asce1885@gmail.com", password: "hunter2hunter2", name: "asce" })
      .catch((e) => e);

    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe("CONFLICT");
    expect((err as TRPCError).message).toMatch(/already registered/i);
    expect((err as TRPCError).message).not.toMatch(/insert into|Failed query|params:|\$2b\$/);
  });
});

// The panel's whole security story is one line: a session that is not the
// configured administrator gets nothing. It is worth a test precisely because
// it is invisible — the UI hides every link, so a broken guard looks identical
// to a working one until someone calls the API.
describe("panel administrator guard", () => {
  it("refuses a signed-in session that is not the administrator", async () => {
    const caller = makeCaller({
      c: {} as never,
      db: {} as never,
      user: { id: "u-2", email: "someone.else@example.test", role: "admin" } as never,
    });

    const err = await caller.config.overview().catch((e) => e);

    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe("FORBIDDEN");
  });

  it("refuses an anonymous caller with UNAUTHORIZED", async () => {
    const caller = makeCaller({ c: {} as never, db: {} as never, user: null });
    const err = await caller.dashboard.stats().catch((e) => e);
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe("UNAUTHORIZED");
  });

  // Every write goes through the same validator, and the validator runs over
  // EVERY value in the batch BEFORE anything is written — so an out-of-range
  // number cannot half-apply a save.
  it("rejects an out-of-range value and writes nothing", async () => {
    const caller = makeCaller({
      c: {} as never,
      db: {} as never,
      user: { id: "u-1", email: ADMIN_EMAIL, role: "admin" } as never,
    });

    const err = await caller.config
      .save({ values: [{ path: "withdrawFeePercent", value: 99 }] })
      .catch((e) => e);

    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe("BAD_REQUEST");
    expect((err as TRPCError).message).toMatch(/withdrawFeePercent/);
  });
});

// The game's config contract, exercised directly. These are the rules that keep
// the panel from writing a value the live game cannot run.
describe("game config validation", () => {
  it("accepts a plain number inside its declared range", async () => {
    const { validateField } = await import("../shared/config-schema");
    expect(validateField("energyCap", 5000)).toEqual({ ok: true, value: 5000 });
    expect(validateField("energyCap", "5000")).toEqual({ ok: true, value: 5000 });
  });

  it("refuses a value below the game's minimum", async () => {
    const { validateField } = await import("../shared/config-schema");
    expect(validateField("energyCap", -1).ok).toBe(false);
    expect(validateField("adDailyLimit", -5).ok).toBe(false);
  });

  it("refuses an unknown path, so a typo cannot invent a setting", async () => {
    const { validateField } = await import("../shared/config-schema");
    expect(validateField("notARealSetting", 1).ok).toBe(false);
  });

  it("enforces the 5-league shape the game renders", async () => {
    const { validateField } = await import("../shared/config-schema");
    expect(validateField("leagueNames", ["A", "B", "C", "D", "E"]).ok).toBe(true);
    expect(validateField("leagueNames", ["A", "B"]).ok).toBe(false);
  });

  it("validates structured rows field by field", async () => {
    const { validateField } = await import("../shared/config-schema");
    expect(validateField("rigs", [{ name: "Rig", costCoin: 10, perHour: 2 }]).ok).toBe(true);
    expect(validateField("rigs", [{ name: "", costCoin: 10, perHour: 2 }]).ok).toBe(false);
    expect(validateField("rigs", [{ name: "Rig", costCoin: -1, perHour: 2 }]).ok).toBe(false);
  });

  it("strips secrets from the config the game reads", async () => {
    const { publicConfig, resolveConfig } = await import("../shared/config-schema");
    const resolved = resolveConfig({ telegramBotToken: "SECRET-TOKEN", energyCap: 42 });
    const pub = publicConfig(resolved as unknown as Record<string, unknown>);
    expect(pub.telegramBotToken).toBeUndefined();
    expect(pub.telegramWebhookSecret).toBeUndefined();
    expect(pub.energyCap).toBe(42);
  });

  it("layers a sparse override over the game's defaults", async () => {
    const { resolveConfig, DEFAULT_CONFIG } = await import("../shared/config-schema");
    const resolved = resolveConfig({ tapBaseReward: 7 });
    expect(resolved.tapBaseReward).toBe(7);
    expect(resolved.coinsPerTon).toBe(DEFAULT_CONFIG.coinsPerTon);
  });
});
