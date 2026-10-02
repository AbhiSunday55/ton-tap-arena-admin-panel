import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "../_core/trpc";
import { Button } from "../components/ui/button";
import {
  AuditView,
  ConfigEditor,
  DashboardHome,
  LedgerView,
  PlayersView,
  PurchasesView,
  SystemView,
  TasksView,
  WithdrawalsView,
} from "../components/ConsoleViews";

/**
 * The console shell. Everything the owner can edit lives in one of these tabs,
 * so the whole game is reachable from a single authenticated screen.
 */
const TABS = [
  { id: "overview", label: "Overview", hint: "Live totals and bridge status" },
  { id: "config", label: "Game config", hint: "Every tunable value" },
  { id: "players", label: "Players", hint: "Accounts and balances" },
  { id: "ledger", label: "Ledger", hint: "Every coin and TON movement" },
  { id: "purchases", label: "Purchases", hint: "Shop and on-chain orders" },
  { id: "withdrawals", label: "Withdrawals", hint: "Payout queue" },
  { id: "tasks", label: "Tasks", hint: "Offer completions" },
  { id: "audit", label: "Audit log", hint: "Who changed what" },
  { id: "system", label: "System", hint: "Game connection and password" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<TabId>("overview");
  const session = trpc.panel.session.useQuery();
  const utils = trpc.useUtils();
  const stats = trpc.dashboard.stats.useQuery();

  const logout = trpc.panel.logout.useMutation({
    onSuccess: () => {
      // Same reason as the login page, in reverse: write the cache so the guard
      // trusts the sign-out immediately instead of on a later refetch.
      utils.panel.session.setData(undefined, { authenticated: false, email: null, name: null });
      setLocation("/login");
    },
  });

  const maintenance = stats.data?.maintenanceMode ?? false;

  return (
    <div className="panel-page min-h-screen">
      {maintenance ? (
        <div className="bg-destructive/90 px-4 py-2 text-center text-sm font-semibold text-white">
          Maintenance mode is ON — players are blocked from the game right now.
        </div>
      ) : null}

      <header className="sticky top-0 z-20 border-b border-border bg-[#0a1020]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-sm">
              🎯
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold">TON Tap Arena</p>
              <p className="panel-caption">Control Panel</p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="panel-caption">Signed in as</p>
              <p className="mono text-xs">{session.data?.email ?? "—"}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => logout.mutate()} disabled={logout.isPending}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1500px] gap-5 px-4 py-5">
        <nav className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-20 flex flex-col gap-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={
                  "rounded-lg border px-3 py-2 text-left transition-colors " +
                  (tab === t.id
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-transparent hover:border-border hover:bg-white/[0.02]")
                }
              >
                <span className="block text-sm font-medium">{t.label}</span>
                <span className="panel-caption block">{t.hint}</span>
              </button>
            ))}
          </div>
        </nav>

        <main className="min-w-0 flex-1">
          <div className="mb-4 flex gap-1.5 overflow-x-auto lg:hidden">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={
                  "whitespace-nowrap rounded-full border px-3 py-1.5 text-xs " +
                  (tab === t.id ? "border-primary/50 bg-primary/10" : "border-border")
                }
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "overview" ? <DashboardHome /> : null}
          {tab === "config" ? <ConfigEditor /> : null}
          {tab === "players" ? <PlayersView /> : null}
          {tab === "ledger" ? <LedgerView /> : null}
          {tab === "purchases" ? <PurchasesView /> : null}
          {tab === "withdrawals" ? <WithdrawalsView /> : null}
          {tab === "tasks" ? <TasksView /> : null}
          {tab === "audit" ? <AuditView /> : null}
          {tab === "system" ? <SystemView /> : null}
        </main>
      </div>
    </div>
  );
}
