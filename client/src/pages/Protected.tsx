// Superseded: the console's guard lives in App.tsx and asks the server
// (`panel.session`) whether the session is the configured administrator. This
// module is kept as a harmless pass-through so a stale import still resolves.
import type { ReactNode } from "react";

export default function Protected({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
