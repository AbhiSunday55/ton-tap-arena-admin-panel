// ══════════════════════════════════════════════════════════════════════════════
// Every screen of the control panel.
//
// The panel is a single console with tabs (see pages/Dashboard.tsx), so all of
// the owner-facing surfaces live here: the dashboard, the config editor that is
// generated from the GAME'S OWN field descriptor, and the player / money views.
//
// Nothing here holds a secret: every value comes from an admin-only tRPC
// procedure, and the two config secrets arrive already masked.
// ══════════════════════════════════════════════════════════════════════════════
import { useMemo, useState } from "react";
import { trpc } from "../_core/trpc";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { NANO } from "../../../shared/config-schema";

// ── formatting ────────────────────────────────────────────────────────────────

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function fmtInt(v: unknown): string {
  return num(v).toLocaleString("en-US");
}

function fmtCoin(v: unknown): string {
  const n = num(v);
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 10_000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}

function fmtTon(nano: unknown): string {
  return (num(nano) / NANO).toFixed(4);
}

function fmtUsd(cents: unknown): string {
  return `$${(num(cents) / 100).toFixed(2)}`;
}

function when(v: unknown): string {
  if (!v) return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function shortAddr(a: unknown): string {
  const s = String(a ?? "");
  if (s.length <= 14) return s || "—";
  return `${s.slice(0, 6)}…${s.slice(-5)}`;
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, header: string[], rows: unknown[][]) {
  const body = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── shared shells ─────────────────────────────────────────────────────────────

function Panel({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <header className="flex flex-wrap items-start gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? <p className="panel-caption mt-0.5">{description}</p> : null}
        </div>
        {actions ? <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      <div>{children}</div>
    </section>
  );
}

function Empty({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="text-2xl">{icon}</span>
      <p className="text-sm font-semibold">{title}</p>
      <p className="panel-caption max-w-md">{body}</p>
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-8">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
      <p className="panel-caption">{label}</p>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <p className="m-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">
      {message}
    </p>
  );
}

function Chip({ tone, children }: { tone: "ok" | "warn" | "bad" | "muted"; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    warn: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    bad: "border-red-500/40 bg-red-500/10 text-red-300",
    muted: "border-border bg-white/[0.03] text-muted-foreground",
  };
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="panel-eyebrow">{label}</p>
      <p className="mono mt-1 text-xl font-semibold">{value}</p>
      {hint ? <p className="panel-caption mt-0.5">{hint}</p> : null}
    </div>
  );
}

function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center gap-3 border-t border-border px-4 py-2.5">
      <p className="panel-caption">
        Page <span className="mono">{page}</span> of <span className="mono">{pages}</span> ·{" "}
        <span className="mono">{fmtInt(total)}</span> rows
      </p>
      <div className="ml-auto flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Overview
// ══════════════════════════════════════════════════════════════════════════════

export function DashboardHome() {
  const stats = trpc.dashboard.stats.useQuery();

  if (stats.isLoading) return <Loading label="Loading live totals…" />;
  if (stats.error) return <ErrorBox message={stats.error.message} />;
  const s = stats.data;
  if (!s) return null;

  const conn = s.connection;
  const bridge = !conn?.baseUrl
    ? { tone: "warn" as const, text: "Game URL not set — changes save here but are not live yet" }
    : conn.lastPushOk === true
      ? { tone: "ok" as const, text: "Connected — last push reached the game" }
      : conn.lastPushOk === false
        ? { tone: "bad" as const, text: conn.lastPushError ?? "Last push to the game failed" }
        : { tone: "muted" as const, text: "Connected — no push attempted yet" };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="panel-title">Overview</h1>
        <p className="panel-caption mt-1">
          Live state of the game. Every figure below comes from the panel's own database.
        </p>
      </div>

      <Panel
        title="Game bridge"
        description="A save writes here AND is pushed straight into the game's settings table."
      >
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <Chip tone={bridge.tone}>{bridge.text}</Chip>
          <span className="mono panel-caption">{conn?.baseUrl || "no game URL"}</span>
          {conn?.lastPushAt ? (
            <span className="panel-caption ml-auto">Last push {when(conn.lastPushAt)}</span>
          ) : null}
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Players" value={fmtInt(s.players.total)} hint={`${fmtInt(s.players.active)} active · ${fmtInt(s.players.banned)} banned`} />
        <Stat label="Coin held" value={fmtCoin(s.players.coins)} hint={`${fmtCoin(s.players.weekCoins)} mined this week`} />
        <Stat label="TON held" value={fmtTon(s.players.nanoTon)} hint="across all player balances" />
        <Stat label="Total taps" value={fmtCoin(s.players.taps)} hint="all time" />
        <Stat
          label="Withdrawals"
          value={fmtInt(s.withdrawals.pending)}
          hint={`pending · ${fmtTon(s.withdrawals.pendingNanoTon)} TON queued`}
        />
        <Stat
          label="Purchases"
          value={fmtInt(s.purchases.total)}
          hint={`${fmtUsd(s.purchases.revenueCents)} lifetime`}
        />
        <Stat label="Task completions" value={fmtInt(s.taskCompletions)} hint="offers completed" />
        <Stat label="Config fields set" value={fmtInt(s.overrides)} hint="values overriding the game's defaults" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Game state" description="Flags that affect every player right now.">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Chip tone={s.maintenanceMode ? "bad" : "ok"}>
              {s.maintenanceMode ? "Maintenance mode ON" : "Game live"}
            </Chip>
            {s.announcementBanner ? (
              <p className="panel-caption">Banner: “{s.announcementBanner}”</p>
            ) : (
              <p className="panel-caption">No announcement banner.</p>
            )}
          </div>
        </Panel>

        <Panel title="Activity" description="Where to look when something needs checking.">
          <ul className="flex flex-col gap-1.5 px-4 py-3">
            <li className="panel-caption">
              <span className="mono">{fmtInt(s.ledgerRows)}</span> ledger rows recorded
            </li>
            <li className="panel-caption">
              Last player seen: <span className="mono">{when(s.lastSeenAt)}</span>
            </li>
            <li className="panel-caption">
              <span className="mono">{fmtInt(s.players.premium)}</span> premium accounts
            </li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Config editor — generated from the game's own CONFIG_FIELDS
// ══════════════════════════════════════════════════════════════════════════════

type FieldDef = {
  path: string;
  label: string;
  group: string;
  type: "number" | "percent" | "ton" | "usdt" | "text" | "url" | "bool" | "numberlist" | "json";
  step?: number;
  min?: number;
  max?: number;
  help?: string;
};

type Draft = Record<string, string>;

/** Turn an editor string back into the type the game expects. */
function parseDraft(field: FieldDef, raw: string): { ok: true; value: unknown } | { ok: false; message: string } {
  const text = raw.trim();
  switch (field.type) {
    case "bool":
      return { ok: true, value: text === "true" };
    case "number":
    case "percent":
    case "ton":
    case "usdt": {
      if (text === "") return { ok: false, message: "Enter a number." };
      const n = Number(text);
      if (!Number.isFinite(n)) return { ok: false, message: "That is not a number." };
      return { ok: true, value: n };
    }
    case "numberlist":
    case "json": {
      try {
        const parsed: unknown = JSON.parse(text);
        return { ok: true, value: parsed };
      } catch {
        return { ok: false, message: "Not valid JSON." };
      }
    }
    default:
      return { ok: true, value: raw };
  }
}

function initialDraft(field: FieldDef, value: unknown): string {
  if (field.type === "json" || field.type === "numberlist") return JSON.stringify(value ?? null);
  if (field.type === "bool") return value ? "true" : "false";
  return value === null || value === undefined ? "" : String(value);
}

export function ConfigEditor() {
  const ov = trpc.config.overview.useQuery();
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState<Draft>({});
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const save = trpc.config.save.useMutation({
    onSuccess: async (res) => {
      setDraft({});
      setNotice({
        tone: res.push.ok ? "ok" : "bad",
        text: res.push.ok
          ? `Saved ${res.saved.length} change${res.saved.length === 1 ? "" : "s"} and pushed to the live game.`
          : `Saved ${res.saved.length} change${res.saved.length === 1 ? "" : "s"} here — but the game did not take them: ${res.push.error ?? "unknown error"}`,
      });
      await utils.config.overview.invalidate();
      await utils.dashboard.stats.invalidate();
    },
    onError: (e) => setNotice({ tone: "bad", text: e.message }),
  });

  const reset = trpc.config.reset.useMutation({
    onSuccess: async (res) => {
      setDraft({});
      setNotice({
        tone: res.push.ok ? "ok" : "bad",
        text: res.push.ok
          ? `Reset ${res.reset.length} field${res.reset.length === 1 ? "" : "s"} to the game's defaults and pushed them live.`
          : `Reset ${res.reset.length} field${res.reset.length === 1 ? "" : "s"} here — the game did not take them: ${res.push.error ?? "unknown error"}`,
      });
      await utils.config.overview.invalidate();
    },
    onError: (e) => setNotice({ tone: "bad", text: e.message }),
  });

  const pushAll = trpc.config.pushAll.useMutation({
    onSuccess: async (res) => {
      setNotice({
        tone: res.ok ? "ok" : "bad",
        text: res.ok ? `Pushed all ${res.count} stored values to the live game.` : `Push failed: ${res.error ?? "unknown error"}`,
      });
      await utils.config.overview.invalidate();
    },
  });

  const fields = useMemo<FieldDef[]>(() => (ov.data?.fields ?? []) as FieldDef[], [ov.data]);
  const groups = useMemo<string[]>(() => [...(ov.data?.groups ?? [])], [ov.data]);

  const dirtyPaths = useMemo(
    () =>
      fields
        .filter((f) => draft[f.path] !== undefined && draft[f.path] !== initialDraft(f, ov.data?.values?.[f.path]))
        .map((f) => f.path),
    [draft, fields, ov.data],
  );

  if (ov.isLoading) return <Loading label="Loading the game's configuration…" />;
  if (ov.error) return <ErrorBox message={ov.error.message} />;
  if (!ov.data || fields.length === 0) {
    return (
      <Panel title="Game config">
        <Empty
          icon="🎛️"
          title="No editable fields found"
          body="The field descriptor could not be loaded. Reload the page — if this persists, the panel's shared/config-schema.ts is out of step with the game."
        />
      </Panel>
    );
  }

  const game = ov.data.game;
  const outOfSync = new Map(game.outOfSync.map((d) => [d.path, d]));

  function setField(path: string, value: string) {
    setDraft((d) => ({ ...d, [path]: value }));
  }

  function saveAll() {
    setNotice(null);
    const payload: { path: string; value: unknown }[] = [];
    const problems: string[] = [];
    for (const path of dirtyPaths) {
      const field = fields.find((f) => f.path === path);
      if (!field) continue;
      const parsed = parseDraft(field, draft[path] ?? "");
      if (!parsed.ok) problems.push(`${field.label}: ${parsed.message}`);
      else payload.push({ path, value: parsed.value });
    }
    if (problems.length) {
      setNotice({ tone: "bad", text: `Fix these first — ${problems.join(" · ")}` });
      return;
    }
    save.mutate({ values: payload });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h1 className="panel-title">Game config</h1>
          <p className="panel-caption mt-1">
            Every value below is a control the game reads. Saving writes it to the panel's database <em>and</em> pushes it
            into the live game — no redeploy.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => pushAll.mutate()} disabled={pushAll.isPending}>
            Push all live
          </Button>
          <Button size="sm" onClick={saveAll} disabled={save.isPending || dirtyPaths.length === 0}>
            {save.isPending ? "Saving…" : dirtyPaths.length ? `Save ${dirtyPaths.length} change${dirtyPaths.length === 1 ? "" : "s"}` : "Saved"}
          </Button>
        </div>
      </div>

      {notice ? (
        <p
          className={
            "rounded-md border px-3 py-2 text-sm " +
            (notice.tone === "ok"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-destructive/40 bg-destructive/10 text-red-300")
          }
        >
          {notice.text}
        </p>
      ) : null}

      {dirtyPaths.length > 0 ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          {dirtyPaths.length} unsaved change{dirtyPaths.length === 1 ? "" : "s"}. Nothing is live until you press Save.
        </p>
      ) : null}

      <Panel
        title="Live status"
        description="Whether the panel can reach the game and read back what it holds."
      >
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <Chip tone={game.reachable ? "ok" : "warn"}>
            {game.reachable ? "Game reachable — reading its live config" : "Game not reachable"}
          </Chip>
          {game.reachable && game.outOfSync.length > 0 ? (
            <Chip tone="warn">{game.outOfSync.length} field(s) differ from the game — press “Push all live”</Chip>
          ) : null}
          {!game.reachable && game.error ? <span className="panel-caption">{game.error}</span> : null}
        </div>
      </Panel>

      {groups.map((group) => {
        const groupFields = fields.filter((f) => f.group === group);
        if (groupFields.length === 0) return null;
        const dirtyInGroup = groupFields.filter((f) => dirtyPaths.includes(f.path));
        return (
          <Panel
            key={group}
            title={group}
            description={`${groupFields.length} control${groupFields.length === 1 ? "" : "s"}`}
            actions={
              groupFields.length > 1 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => reset.mutate({ paths: groupFields.map((f) => f.path) })}
                  disabled={reset.isPending}
                >
                  Reset group to defaults
                </Button>
              ) : null
            }
          >
            {dirtyInGroup.length > 0 ? (
              <p className="border-b border-border bg-amber-500/[0.07] px-4 py-1.5 text-xs text-amber-300">
                {dirtyInGroup.length} unsaved in this group
              </p>
            ) : null}
            <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
              {groupFields.map((field) => {
                const stored = initialDraft(field, ov.data?.values?.[field.path]);
                const shown = draft[field.path] ?? stored;
                const dirty = dirtyPaths.includes(field.path);
                const drifted = outOfSync.get(field.path);
                const longText = field.type === "json" || field.type === "numberlist";
                return (
                  <div key={field.path} className={"panel-field " + (dirty ? "panel-field-dirty" : "")}>
                    <div className="flex items-start gap-2">
                      <Label htmlFor={`f-${field.path}`} className="text-xs font-medium leading-tight">
                        {field.label}
                      </Label>
                      <button
                        type="button"
                        title="Reset this field to the game's default"
                        onClick={() => reset.mutate({ paths: [field.path] })}
                        className="ml-auto shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      >
                        reset
                      </button>
                    </div>

                    <p className="mono text-[10px] text-muted-foreground">{field.path}</p>

                    {field.type === "bool" ? (
                      <select
                        id={`f-${field.path}`}
                        value={shown === "true" ? "true" : "false"}
                        onChange={(e) => setField(field.path, e.target.value)}
                        className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                      >
                        <option value="false">Off</option>
                        <option value="true">On</option>
                      </select>
                    ) : longText ? (
                      <textarea
                        id={`f-${field.path}`}
                        value={shown}
                        rows={field.type === "json" ? 4 : 2}
                        onChange={(e) => setField(field.path, e.target.value)}
                        className="mono w-full rounded-md border border-input bg-transparent p-2 text-xs"
                        spellCheck={false}
                      />
                    ) : (
                      <Input
                        id={`f-${field.path}`}
                        type={["number", "percent", "ton", "usdt"].includes(field.type) ? "number" : "text"}
                        step={field.step}
                        min={field.min}
                        max={field.max}
                        value={shown}
                        onChange={(e) => setField(field.path, e.target.value)}
                        className="mono h-8 text-xs"
                      />
                    )}

                    {field.help ? <p className="text-[11px] leading-snug text-muted-foreground">{field.help}</p> : null}

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="mono text-[10px] text-muted-foreground">
                        default {field.type === "json" || field.type === "numberlist" ? "(list)" : String(ov.data?.defaults?.[field.path] ?? "—")}
                      </span>
                      {dirty ? <Chip tone="warn">unsaved</Chip> : null}
                      {!dirty && drifted ? <Chip tone="warn">differs from game</Chip> : null}
                      {ov.data?.updatedAt?.[field.path] ? (
                        <span className="panel-caption ml-auto">{when(ov.data.updatedAt[field.path])}</span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Players
// ══════════════════════════════════════════════════════════════════════════════

export function PlayersView() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [onlyBanned, setOnlyBanned] = useState(false);
  const list = trpc.players.list.useQuery({ search, page, pageSize: 25, onlyBanned });
  const setStatus = trpc.players.setStatus.useMutation({ onSuccess: () => void list.refetch() });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="panel-title">Players</h1>
        <p className="panel-caption mt-1">
          Accounts the game has pushed into the panel, with balances, taps and referrals.
        </p>
      </div>

      <Panel
        title="Accounts"
        actions={
          <>
            <select
              value={onlyBanned ? "banned" : "all"}
              onChange={(e) => {
                setOnlyBanned(e.target.value === "banned");
                setPage(1);
              }}
              className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
            >
              <option value="all">All players</option>
              <option value="banned">Banned only</option>
            </select>
            <Input
              placeholder="Search handle, id, wallet…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="h-8 w-56 text-xs"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(
                  "players.csv",
                  ["userId", "handle", "username", "wallet", "coins", "nanoTon", "taps", "weekCoins", "league", "premium", "status", "referredBy", "createdAt", "lastSeenAt"],
                  (list.data?.rows ?? []).map((p) => [
                    p.userId, p.handle, p.username, p.walletAddress, p.balanceCoin, p.balanceNanoTon,
                    p.totalTaps, p.weekCoinMined, p.leagueIndex, p.isPremium, p.status, p.referredBy, p.createdAt, p.lastSeenAt,
                  ]),
                )
              }
            >
              Export CSV
            </Button>
          </>
        }
      >
        {list.isLoading ? (
          <Loading label="Loading players…" />
        ) : list.error ? (
          <ErrorBox message={list.error.message} />
        ) : (list.data?.rows.length ?? 0) === 0 ? (
          <Empty
            icon="👥"
            title="No players yet"
            body="The game pushes its accounts in through the ingest endpoint (System → Ingest). Until it does, this view stays empty — the panelled config editor still works without it."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="panel-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Wallet</th>
                  <th className="text-right">Coin</th>
                  <th className="text-right">TON</th>
                  <th className="text-right">Taps</th>
                  <th className="text-right">Week</th>
                  <th>League</th>
                  <th>Referrals</th>
                  <th>Status</th>
                  <th>Last seen</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(list.data?.rows ?? []).map((p) => (
                  <tr key={p.userId}>
                    <td>
                      <span className="block text-xs font-medium">{p.handle || "(no handle)"}</span>
                      <span className="mono block text-[10px] text-muted-foreground">{p.userId}</span>
                    </td>
                    <td className="mono text-[11px]">{shortAddr(p.walletAddress)}</td>
                    <td className="mono text-right">{fmtCoin(p.balanceCoin)}</td>
                    <td className="mono text-right">{fmtTon(p.balanceNanoTon)}</td>
                    <td className="mono text-right">{fmtCoin(p.totalTaps)}</td>
                    <td className="mono text-right">{fmtCoin(p.weekCoinMined)}</td>
                    <td className="mono">{p.leagueIndex}</td>
                    <td className="mono">{fmtInt(p.referralCount)}</td>
                    <td>
                      <Chip tone={p.status === "banned" ? "bad" : "ok"}>{p.status}</Chip>
                      {p.isPremium ? <Chip tone="warn">premium</Chip> : null}
                    </td>
                    <td className="panel-caption">{when(p.lastSeenAt)}</td>
                    <td>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={setStatus.isPending}
                        onClick={() => setStatus.mutate({ userId: p.userId, status: p.status === "banned" ? "active" : "banned" })}
                      >
                        {p.status === "banned" ? "Unban" : "Ban"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.data && list.data.total > 0 ? (
          <Pager page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />
        ) : null}
      </Panel>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Ledger
// ══════════════════════════════════════════════════════════════════════════════

export function LedgerView() {
  const [kind, setKind] = useState("");
  const [userId, setUserId] = useState("");
  const [page, setPage] = useState(1);
  const facets = trpc.money.facets.useQuery();
  const list = trpc.money.ledger.useQuery({ kind: kind || undefined, userId: userId || undefined, page, pageSize: 50 });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="panel-title">Transaction ledger</h1>
        <p className="panel-caption mt-1">Every coin and TON movement the game has recorded, newest first.</p>
      </div>

      <Panel
        title="Movements"
        actions={
          <>
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setPage(1);
              }}
              className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
            >
              <option value="">All kinds</option>
              {(facets.data?.kinds ?? []).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <Input
              placeholder="Filter by player id…"
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                setPage(1);
              }}
              className="mono h-8 w-52 text-xs"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(
                  "ledger.csv",
                  ["id", "userId", "kind", "deltaCoin", "deltaNanoTon", "note", "refType", "refId", "createdAt"],
                  (list.data?.rows ?? []).map((r) => [
                    r.id, r.userId, r.kind, r.deltaCoin, r.deltaNanoTon, r.note, r.refType, r.refId, r.createdAt,
                  ]),
                )
              }
            >
              Export CSV
            </Button>
          </>
        }
      >
        {list.isLoading ? (
          <Loading label="Loading ledger…" />
        ) : list.error ? (
          <ErrorBox message={list.error.message} />
        ) : (list.data?.rows.length ?? 0) === 0 ? (
          <Empty
            icon="📒"
            title="No ledger rows yet"
            body="The game pushes its ledger through the ingest endpoint (System → Ingest). Once rows arrive, this becomes the full audit trail of every coin and TON movement."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="panel-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Kind</th>
                  <th>Player</th>
                  <th className="text-right">Coin Δ</th>
                  <th className="text-right">TON Δ</th>
                  <th>Reference</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {(list.data?.rows ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="panel-caption whitespace-nowrap">{when(r.createdAt)}</td>
                    <td>
                      <Chip tone="muted">{r.kind}</Chip>
                    </td>
                    <td className="mono text-[11px]">{r.userId}</td>
                    <td className={"mono text-right " + (num(r.deltaCoin) < 0 ? "text-red-300" : "text-emerald-300")}>
                      {num(r.deltaCoin) > 0 ? "+" : ""}
                      {fmtInt(r.deltaCoin)}
                    </td>
                    <td className={"mono text-right " + (num(r.deltaNanoTon) < 0 ? "text-red-300" : "text-emerald-300")}>
                      {num(r.deltaNanoTon) > 0 ? "+" : ""}
                      {fmtTon(r.deltaNanoTon)}
                    </td>
                    <td className="mono text-[11px]">
                      {r.refType ? `${r.refType}${r.refId ? `:${shortAddr(r.refId)}` : ""}` : "—"}
                    </td>
                    <td className="text-[11px] text-muted-foreground">{r.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.data && list.data.total > 0 ? (
          <Pager page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />
        ) : null}
      </Panel>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Purchases
// ══════════════════════════════════════════════════════════════════════════════

export function PurchasesView() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const list = trpc.money.purchases.useQuery({ status: status || undefined, page, pageSize: 50 });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="panel-title">Purchases</h1>
        <p className="panel-caption mt-1">Shop items bought with coin or paid on-chain.</p>
      </div>

      <Panel
        title="Orders"
        actions={
          <>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
            >
              <option value="">All statuses</option>
              {["pending", "paid", "delivered", "failed", "refunded"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(
                  "purchases.csv",
                  ["id", "userId", "itemSlug", "itemName", "category", "tier", "priceUsdtCents", "payCurrency", "amountNanoTon", "status", "txHash", "createdAt"],
                  (list.data?.rows ?? []).map((r) => [
                    r.id, r.userId, r.itemSlug, r.itemName, r.category, r.tier, r.priceUsdtCents, r.payCurrency, r.amountNanoTon, r.status, r.txHash, r.createdAt,
                  ]),
                )
              }
            >
              Export CSV
            </Button>
          </>
        }
      >
        {list.isLoading ? (
          <Loading label="Loading purchases…" />
        ) : list.error ? (
          <ErrorBox message={list.error.message} />
        ) : (list.data?.rows.length ?? 0) === 0 ? (
          <Empty
            icon="🛒"
            title="No purchases yet"
            body="Nothing has been bought since the panel started mirroring the game. Orders appear here as soon as the game pushes them via the ingest endpoint."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="panel-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Item</th>
                  <th>Player</th>
                  <th className="text-right">Price</th>
                  <th>Paid with</th>
                  <th className="text-right">TON</th>
                  <th>Status</th>
                  <th>Tx</th>
                </tr>
              </thead>
              <tbody>
                {(list.data?.rows ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="panel-caption whitespace-nowrap">{when(r.createdAt)}</td>
                    <td>
                      <span className="block text-xs font-medium">{r.itemName || r.itemSlug}</span>
                      <span className="mono block text-[10px] text-muted-foreground">{[r.category, r.tier].filter(Boolean).join(" · ")}</span>
                    </td>
                    <td className="mono text-[11px]">{r.userId}</td>
                    <td className="mono text-right">{fmtUsd(r.priceUsdtCents)}</td>
                    <td className="mono">{r.payCurrency}</td>
                    <td className="mono text-right">{fmtTon(r.amountNanoTon)}</td>
                    <td>
                      <Chip tone={r.status === "failed" ? "bad" : r.status === "pending" ? "warn" : "ok"}>{r.status}</Chip>
                    </td>
                    <td className="mono text-[10px] text-muted-foreground">{shortAddr(r.txHash)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.data && list.data.total > 0 ? (
          <Pager page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />
        ) : null}
      </Panel>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Withdrawals
// ══════════════════════════════════════════════════════════════════════════════

export function WithdrawalsView() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [txFor, setTxFor] = useState<string | null>(null);
  const [txHash, setTxHash] = useState("");
  const list = trpc.money.withdrawals.useQuery({ status: status || undefined, page, pageSize: 50 });
  const decide = trpc.money.setWithdrawalStatus.useMutation({
    onSuccess: () => {
      setTxFor(null);
      setTxHash("");
      void list.refetch();
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="panel-title">Withdrawals</h1>
        <p className="panel-caption mt-1">
          The payout queue. Marking one “sent” records the transaction hash — the panel never signs or broadcasts a chain
          transaction itself.
        </p>
      </div>

      <Panel
        title="Payout queue"
        actions={
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
          >
            <option value="">All statuses</option>
            {["pending", "processing", "approved", "sent", "rejected", "failed"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        }
      >
        {list.isLoading ? (
          <Loading label="Loading withdrawals…" />
        ) : list.error ? (
          <ErrorBox message={list.error.message} />
        ) : (list.data?.rows.length ?? 0) === 0 ? (
          <Empty
            icon="🏦"
            title="No withdrawal requests"
            body="When a player requests a payout, the game pushes the request here and it appears in this queue for approval."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="panel-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Player</th>
                  <th>Payout address</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Fee</th>
                  <th className="text-right">Net</th>
                  <th>Status</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody>
                {(list.data?.rows ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="panel-caption whitespace-nowrap">{when(r.createdAt)}</td>
                    <td className="mono text-[11px]">{r.userId}</td>
                    <td className="mono text-[11px]" title={r.payoutAddress}>
                      {shortAddr(r.payoutAddress)}
                    </td>
                    <td className="mono text-right">{fmtTon(r.amountNanoTon)}</td>
                    <td className="mono text-right">{fmtTon(r.feeNanoTon)}</td>
                    <td className="mono text-right">{fmtTon(r.netNanoTon)}</td>
                    <td>
                      <Chip
                        tone={
                          r.status === "sent" || r.status === "approved"
                            ? "ok"
                            : r.status === "rejected" || r.status === "failed"
                              ? "bad"
                              : "warn"
                        }
                      >
                        {r.status}
                      </Chip>
                      {r.txHash ? (
                        <span className="mono mt-1 block text-[10px] text-muted-foreground">{shortAddr(r.txHash)}</span>
                      ) : null}
                      {r.decidedBy ? <span className="panel-caption mt-1 block">{r.decidedBy}</span> : null}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={decide.isPending}
                          onClick={() => decide.mutate({ id: r.id, status: "approved" })}
                        >
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => setTxFor(txFor === r.id ? null : r.id)}>
                          Mark sent
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={decide.isPending}
                          onClick={() => decide.mutate({ id: r.id, status: "rejected" })}
                        >
                          Reject
                        </Button>
                      </div>
                      {txFor === r.id ? (
                        <div className="mt-2 flex items-center gap-2">
                          <Input
                            placeholder="Transaction hash"
                            value={txHash}
                            onChange={(e) => setTxHash(e.target.value)}
                            className="mono h-8 text-xs"
                          />
                          <Button size="sm" onClick={() => decide.mutate({ id: r.id, status: "sent", txHash })} disabled={!txHash}>
                            Save
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.data && list.data.total > 0 ? (
          <Pager page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />
        ) : null}
      </Panel>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Tasks
// ══════════════════════════════════════════════════════════════════════════════

export function TasksView() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const list = trpc.money.tasks.useQuery({ status: status || undefined, page, pageSize: 50 });
  const decide = trpc.money.setTaskStatus.useMutation({ onSuccess: () => void list.refetch() });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="panel-title">Task completions</h1>
        <p className="panel-caption mt-1">Offers and tasks players have completed, and the coin each one paid.</p>
      </div>

      <Panel
        title="Completions"
        actions={
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
          >
            <option value="">All statuses</option>
            {["pending", "verified", "rejected"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        }
      >
        {list.isLoading ? (
          <Loading label="Loading completions…" />
        ) : list.error ? (
          <ErrorBox message={list.error.message} />
        ) : (list.data?.rows.length ?? 0) === 0 ? (
          <Empty
            icon="✅"
            title="No task completions yet"
            body="When the game reports an offer completion, it lands here so you can verify or reject it. The offer links and rewards themselves are editable under Game config → Ads."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="panel-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Offer</th>
                  <th>Player</th>
                  <th className="text-right">Reward</th>
                  <th>Status</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody>
                {(list.data?.rows ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="panel-caption whitespace-nowrap">{when(r.completedAt)}</td>
                    <td>
                      <span className="block text-xs font-medium">{r.offerTitle || r.offerSlug}</span>
                      <span className="mono block text-[10px] text-muted-foreground">{r.offerSlug}</span>
                    </td>
                    <td className="mono text-[11px]">{r.userId}</td>
                    <td className="mono text-right">{fmtCoin(r.rewardCoin)}</td>
                    <td>
                      <Chip tone={r.status === "verified" ? "ok" : r.status === "rejected" ? "bad" : "warn"}>{r.status}</Chip>
                    </td>
                    <td>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, status: "verified" })}>
                          Verify
                        </Button>
                        <Button size="sm" variant="destructive" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, status: "rejected" })}>
                          Reject
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.data && list.data.total > 0 ? (
          <Pager page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />
        ) : null}
      </Panel>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Audit log
// ══════════════════════════════════════════════════════════════════════════════

export function AuditView() {
  const [page, setPage] = useState(1);
  const list = trpc.config.history.useQuery({ limit: 200 });
  const pageSize = 25;
  const all = list.data ?? [];
  const rows = all.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="panel-title">Audit log</h1>
        <p className="panel-caption mt-1">Every configuration change: what changed, from what, to what, and whether the game took it.</p>
      </div>

      <Panel title="Changes" description={`${all.length} most recent entries`}>
        {list.isLoading ? (
          <Loading label="Loading the audit log…" />
        ) : list.error ? (
          <ErrorBox message={list.error.message} />
        ) : all.length === 0 ? (
          <Empty
            icon="🧾"
            title="No config changes yet"
            body="Nothing has been edited since the panel was installed. Every save, reset and push recorded here will show the old value, the new value and whether it reached the game."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="panel-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Field</th>
                  <th>Change</th>
                  <th>Action</th>
                  <th>Live?</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="panel-caption whitespace-nowrap">{when(r.createdAt)}</td>
                    <td className="mono text-[11px]">{r.path}</td>
                    <td className="mono text-[11px]">
                      <span className="text-muted-foreground">{JSON.stringify(r.oldValue)}</span>
                      <span className="mx-1 text-muted-foreground">→</span>
                      <span className="text-foreground">{JSON.stringify(r.newValue)}</span>
                    </td>
                    <td>
                      <Chip tone="muted">{r.action}</Chip>
                      <span className="panel-caption mt-1 block">{r.actor}</span>
                    </td>
                    <td>
                      {r.pushedToGame ? <Chip tone="ok">pushed</Chip> : <Chip tone="warn">not pushed</Chip>}
                      {r.pushError ? <span className="panel-caption mt-1 block max-w-[16rem]">{r.pushError}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {all.length > pageSize ? (
          <Pager page={page} pageSize={pageSize} total={all.length} onPage={setPage} />
        ) : null}
      </Panel>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// System
// ══════════════════════════════════════════════════════════════════════════════

export function SystemView() {
  const conn = trpc.system.connection.useQuery();
  const utils = trpc.useUtils();
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const setConnection = trpc.system.setConnection.useMutation({
    onSuccess: async () => {
      setNotice({ tone: "ok", text: "Game URL saved. Changes will now be pushed live." });
      setBaseUrl(null);
      await utils.system.connection.invalidate();
      await utils.config.overview.invalidate();
    },
    onError: (e) => setNotice({ tone: "bad", text: e.message }),
  });

  const test = trpc.system.testConnection.useMutation({
    onSuccess: async (res) => {
      setNotice({
        tone: res.ok ? "ok" : "bad",
        text: res.ok
          ? `Connected. The game reports ${res.overrides} stored config override(s).`
          : `Could not reach the game: ${res.error ?? "unknown error"}`,
      });
      await utils.system.connection.invalidate();
    },
  });

  const rotate = trpc.system.rotateIngestToken.useMutation({
    onSuccess: async () => {
      setNotice({ tone: "ok", text: "New ingest token generated. Update the game with it — the old one stops working immediately." });
      await utils.system.connection.invalidate();
    },
  });

  const pushAll = trpc.config.pushAll.useMutation({
    onSuccess: (res) =>
      setNotice({
        tone: res.ok ? "ok" : "bad",
        text: res.ok ? `Pushed ${res.count} values to the live game.` : `Push failed: ${res.error ?? "unknown error"}`,
      }),
  });

  const changePassword = trpc.panel.changePassword.useMutation({
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setNotice({ tone: "ok", text: "Admin password changed. Use the new one next time you sign in." });
    },
    onError: (e) => setNotice({ tone: "bad", text: e.message }),
  });

  const shown = baseUrl ?? conn.data?.baseUrl ?? "";
  const ingestUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/trpc/ingest.push`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="panel-title">System</h1>
        <p className="panel-caption mt-1">The panel's connection to the live game, the data-push token, and your password.</p>
      </div>

      {notice ? (
        <p
          className={
            "rounded-md border px-3 py-2 text-sm " +
            (notice.tone === "ok"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-destructive/40 bg-destructive/10 text-red-300")
          }
        >
          {notice.text}
        </p>
      ) : null}

      <Panel
        title="Game connection"
        description="Where the panel sends edits. This is the game's own server URL — the panel logs in to its admin API and writes through it."
      >
        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-col gap-1.5 md:max-w-2xl">
            <Label htmlFor="game-url">Game server URL</Label>
            <Input
              id="game-url"
              placeholder="https://your-game.example.com"
              value={shown}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="mono text-xs"
            />
            <p className="panel-caption">
              Must be the running game server (the same origin that serves its tRPC API) — not a GitHub Pages host, which
              serves only static files.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={setConnection.isPending}
              onClick={() => setConnection.mutate({ baseUrl: shown, enabled: conn.data?.enabled ?? true })}
            >
              {setConnection.isPending ? "Saving…" : "Save URL"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => test.mutate()} disabled={test.isPending}>
              {test.isPending ? "Testing…" : "Test connection"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => pushAll.mutate()} disabled={pushAll.isPending}>
              Push all config live
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConnection.mutate({ enabled: !(conn.data?.enabled ?? true) })}
            >
              {conn.data?.enabled ?? true ? "Disable live push" : "Enable live push"}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2">
            <Chip tone={conn.data?.lastCheckOk === true ? "ok" : conn.data?.lastCheckOk === false ? "bad" : "muted"}>
              {conn.data?.lastCheckOk === true
                ? "Reachable"
                : conn.data?.lastCheckOk === false
                  ? "Unreachable"
                  : "Not tested yet"}
            </Chip>
            {conn.data?.lastCheckAt ? <span className="panel-caption">Checked {when(conn.data.lastCheckAt)}</span> : null}
            {conn.data?.lastCheckError ? <span className="panel-caption text-red-300">{conn.data.lastCheckError}</span> : null}
          </div>
        </div>
      </Panel>

      <Panel
        title="Live config endpoint"
        description="The game reads this to pick up changes without a redeploy. Secrets are stripped; no player data is included."
      >
        <div className="p-4">
          <p className="mono break-all rounded-md border border-border bg-black/30 px-3 py-2 text-xs">
            {typeof window !== "undefined" ? `${window.location.origin}/trpc/config.public` : "/trpc/config.public"}
          </p>
          <p className="panel-caption mt-2">
            Fetch at boot and poll every ~60s, then layer the result with the game's own <span className="mono">resolveConfig()</span>.
          </p>
        </div>
      </Panel>

      <Panel
        title="Data ingest"
        description="The game pushes its players, ledger, purchases, withdrawals and task completions in through this token."
      >
        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="panel-eyebrow">Endpoint</span>
            <span className="mono break-all text-xs">{ingestUrl}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="panel-eyebrow">Bearer token</span>
            <p className="mono break-all rounded-md border border-border bg-black/30 px-3 py-2 text-xs">
              {conn.data?.ingestToken ?? "loading…"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => rotate.mutate()} disabled={rotate.isPending}>
              {rotate.isPending ? "Rotating…" : "Rotate token"}
            </Button>
            <p className="panel-caption">Rotating stops the old token working immediately.</p>
          </div>
        </div>
      </Panel>

      <Panel title="Admin password" description="Rotate the password that opens this console.">
        <div className="grid gap-3 p-4 md:max-w-xl md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cur-pw">Current password</Label>
            <Input
              id="cur-pw"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mono"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-pw">New password</Label>
            <Input
              id="new-pw"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mono"
            />
          </div>
          <div className="md:col-span-2">
            <Button
              size="sm"
              disabled={changePassword.isPending || !currentPassword || newPassword.length < 8}
              onClick={() => changePassword.mutate({ currentPassword, newPassword })}
            >
              {changePassword.isPending ? "Changing…" : "Change password"}
            </Button>
            <p className="panel-caption mt-2">At least 8 characters.</p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
