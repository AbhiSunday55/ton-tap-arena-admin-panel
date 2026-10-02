# Game-side integration — TON Tap Arena ↔ Admin Control Panel

Everything in this file is **optional except item 1**, and **none of it touches a
player-facing screen**. The panel already writes configuration straight into the
game's own `settings` table through the game's existing `admin.setConfigBulk`, so
edits made in the panel reach the game's database today.

The two additions below are what make delivery **instant and redeploy-free**, and
what fills the panel's player/ledger views.

---

## 1. Live config (recommended — this is the "no redeploy" path)

The panel serves the whole resolved config. Fetch it at boot and poll it, then
feed the result through the game's existing `resolveConfig()` layering.

```
GET  {PANEL_URL}/trpc/config.public
```

`{PANEL_URL}` is the panel's public URL (the console's `/system` tab prints the
exact string). The response is a **superjson-enveloped** tRPC reply — the same
shape the game's own client already unwraps:

```jsonc
{
  "result": {
    "data": {
      "json": {
        "config": { /* GameConfig — see shared/game-config.ts */ },
        "updatedAt": "2026-10-02T09:00:00.000Z"
      }
    }
  }
}
```

`config` is a **complete** `GameConfig` (defaults already layered under the
admin's overrides), and the telegram secrets are stripped from it — it is safe to
serve to a browser. It is sent with `Cache-Control: no-store` and
`Access-Control-Allow-Origin: *`, so a `fetch` from the game's own origin works.

```ts
// Game: pick up admin edits at boot, then every 60s. No redeploy, no reload.
const PANEL_URL = "https://<the-panel-url>";

async function fetchLiveConfig() {
  const res = await fetch(`${PANEL_URL}/trpc/config.public`, { cache: "no-store" });
  if (!res.ok) return null;
  const body = await res.json();
  return body?.result?.data?.json?.config ?? null;
}

setInterval(async () => {
  const live = await fetchLiveConfig();
  if (live) applyConfigOverrides(live);   // merge into your resolveConfig() layer
}, 60_000);
```

The panel **also** pushes overrides into the game's `settings` table on every
save (via `admin.login` + `admin.setConfigBulk`), so this poll is a belt-and-braces
second path — the game picks up a change even if its settings cache is warm.

---

## 2. Push player data into the panel (optional)

The panel's Players / Ledger / Purchases / Withdrawals / Tasks views read the
panel's own tables. The panel shows a designed empty state until rows arrive.

This is a **server-to-server** call (no CORS, no browser), authenticated with a
bearer token — copy it from the console's **System → Data ingest** panel.

```
POST {PANEL_URL}/trpc/ingest.push
Authorization: Bearer <INGEST_TOKEN>
Content-Type: application/json

{ "json": { "players": [ ... ], "ledger": [ ... ],
            "purchases": [ ... ], "withdrawals": [ ... ],
            "taskCompletions": [ ... ] } }
```

Any subset of the five keys may be sent; each is capped at 2000 rows per call.
There are also single-table variants: `ingest.players`, `ingest.ledger`,
`ingest.purchases`, `ingest.withdrawals`, `ingest.taskCompletions`.

### Field names

Use the game's own column names — the panel accepts them as-is:

| Table | Fields |
|---|---|
| `players` | `userId` (required), `handle`, `avatar`, `telegramId`, `username`, `walletAddress`, `balanceCoin`, `balanceNanoTon`, `vestedNanoTon`, `lockedNanoTon`, `totalTaps`, `totalCoinMined`, `weekCoinMined`, `energy`, `tapPowerLevel`, `leagueIndex`, `isPremium`, `isAdmin`, `isSeed`, `referralCode`, `referredBy`, `referralCount`, `status`, `createdAt`, `lastSeenAt` |
| `ledger` | `id` (required), `userId` (required), `kind`, `deltaCoin`, `deltaNanoTon`, `note`, `refType`, `refId`, `createdAt` |
| `purchases` | `id` (required), `userId` (required), `itemSlug`, `itemName`, `category`, `tier`, `priceUsdtCents`, `payCurrency`, `amountNanoTon`, `status`, `txHash`, `createdAt` |
| `withdrawals` | `id` (required), `userId` (required), `network`, `payoutAddress`, `amountNanoTon`, `feeNanoTon`, `networkFeeNanoTon`, `netNanoTon`, `status`, `txHash`, `failReason`, `createdAt` |
| `taskCompletions` | `id` (required), `userId` (required), `offerSlug`, `offerTitle`, `rewardCoin`, `status`, `proofUrl`, `completedAt` |

Upserts are idempotent on the id/userId keys, so re-sending a batch is safe
(`ledger` and `taskCompletions` insert-once; the rest update in place).

---

## 3. Remove the in-game admin surface

The control panel is a **separate deployment**. It must not be reachable from, or
referenced anywhere inside, the game:

- delete the in-game `/admin` route (and its page component);
- remove any admin link, button, mention or disclaimer from the game's UI and
  bundle;
- keep the `admin.*` tRPC procedures — the panel calls them over HTTP, and they
  are already unreachable without an admin session cookie.

---

## 4. What the panel cannot do

- **It does not sign or broadcast TON transactions.** Marking a withdrawal as
  sent records the transaction hash; the actual transfer is still yours to make.
- **It cannot send email** — the platform has no email capability, so there are
  no invites or password-reset emails.
