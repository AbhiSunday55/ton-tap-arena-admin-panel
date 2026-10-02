// Tiny key/value accessor over the panel's own `panel_settings` table.
// Kept separate from server/db.ts so the guard in panel-auth.ts can read the
// administrator identity without importing the (large) business query layer.
import { eq } from "drizzle-orm";
import { db } from "./db";
import { panelSettings } from "../../drizzle/schema";

export async function getPanelValue<T>(key: string): Promise<T | null> {
  const [row] = await db.select().from(panelSettings).where(eq(panelSettings.key, key)).limit(1);
  return row ? (row.value as T) : null;
}

export async function setPanelValue(key: string, value: unknown): Promise<void> {
  await db
    .insert(panelSettings)
    .values({ key, value: value as never })
    .onConflictDoUpdate({
      target: panelSettings.key,
      set: { value: value as never, updatedAt: new Date() },
    });
}
