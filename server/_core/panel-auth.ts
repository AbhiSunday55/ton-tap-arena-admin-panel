// ══════════════════════════════════════════════════════════════════════════════
// ADMIN-ONLY SESSION GUARD.
//
// The panel has exactly ONE administrator. _core's `adminProcedure` only checks
// `ctx.user.role === 'admin'`, which is not enough here: anyone who could reach
// the sign-up route with a crafted body would otherwise mint a session. So the
// panel gates on BOTH a valid session cookie AND membership of its own
// configured administrator identity — and the sign-up route does not exist.
//
// Every state-changing procedure in server/routers.ts is built on `panelProcedure`
// below, so the check is server-side and cannot be skipped by hiding a button.
// ══════════════════════════════════════════════════════════════════════════════
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "./trpc";
import { getPanelValue } from "./panel-store";

export const ADMIN_EMAIL_KEY = "admin_email";

/**
 * The administrator's own email. Generated once at first boot and stored in
 * `panel_settings`; it is the identity the password-only login signs in as.
 */
export async function getAdminEmail(): Promise<string> {
  const stored = await getPanelValue<string>(ADMIN_EMAIL_KEY);
  return stored ?? "";
}

/** Requires an authenticated session whose user IS the panel administrator. */
export const panelProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const expected = await getAdminEmail();
  if (!expected || ctx.user.email.toLowerCase() !== expected.toLowerCase()) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This console is restricted to the site administrator.",
    });
  }
  return next({ ctx });
});
