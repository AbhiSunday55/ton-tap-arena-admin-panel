# TON Tap Arena — Admin Control Panel

A standalone, password-protected control panel for the TON Tap Arena game. It
edits the **live** game — every value below is read and written against the
game's real configuration and data, with no redeploy.

It is a separate deployment from the game. Nothing in the game links to it, and
no player-facing screen is affected by it.

---

## What it controls

| Area | Where |
|---|---|
| Rewards, tap power, energy, combo, boosters, streak/league thresholds, treasury addresses, withdrawal threshold & fees, ad slot (Adsgram unit ID, reward, daily limit), referral rates, announcement banner, maintenance mode | **Game config** (generated from the game's own `CONFIG_FIELDS`) |
| Players — balances, taps, leagues, referrals, ban/unban | **Players** |
| Every coin and TON movement, filterable, with CSV export | **Ledger** |
| Shop / on-chain orders | **Purchases** |
| Payout queue — approve, reject, mark sent with a transaction hash | **Withdrawals** |
| Offer and task completions — verify or reject | **Tasks** |
| Every configuration change: old → new, who, when, whether the game took it | **Audit log** |
| Game connection, live-config endpoint, ingest token, admin password | **System** |

## How a change reaches the game

Two independent paths, so a save is never silently lost:

1. **Direct write (primary).** Every save is written to this panel's Postgres
   database *and* pushed to the game's own `settings` table over its admin API
   (`admin.login` → `admin.setConfigBulk`). The audit row records whether the
   push succeeded.
2. **Live config poll (secondary).** The panel serves the whole resolved config:

   ```
   GET  {PANEL_URL}/trpc/config.public
   ```

   The game fetches it at boot and polls it, then layers the result through its
   own `resolveConfig()`. Secrets are stripped and the response is
   `no-store` + `Access-Control-Allow-Origin: *`, so it is safe to fetch from the
   game's own origin.

   See **`GAME_INTEGRATION.md`** for the exact snippet, the response envelope
   (superjson) and the optional data-ingest contract.

## Running it

```bash
pnpm install
pnpm --filter ./ drizzle-kit generate   # or: pnpm migrate
pnpm dev:api      # Hono API
pnpm dev:web      # Vite SPA
pnpm typecheck && pnpm test
```

Requires `DATABASE_URL` (see `.env.example`). At first boot the panel creates
its single administrator account and seeds the game's default config, so the
editor is complete from the first load.

## Security model

- **One administrator account**, created server-side at first boot. There is no
  public sign-up and no in-game admin route.
- Every panel procedure is gated by `panelProcedure`, which re-checks the signed
  session's identity against the configured administrator on **every** request.
  A non-administrator session gets `FORBIDDEN`; an anonymous one gets
  `UNAUTHORIZED`.
- Sign-in is rate-limited (10 attempts / 10 minutes) and the session cookie is
  `httpOnly`.
- The two secret config values (telegram bot token, webhook secret) are returned
  to the editor **masked** and are stripped from the public config endpoint, so
  the browser never holds a live secret.
- Every write is validated against the game's own field descriptor — type,
  minimum, maximum, array shape — and the whole batch is validated *before*
  anything is written, so an out-of-range value cannot half-apply a save.
- Ingest is a server-to-server call authenticated with a bearer token that can
  be rotated from the System tab.

## What it deliberately does not do

- **It does not sign or broadcast TON transactions.** Recording a withdrawal as
  sent stores the transaction hash; the transfer itself is still a manual step.
- **It cannot send email** — the platform has no email capability, so there are
  no invites or password-reset emails.
