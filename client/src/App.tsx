import type { ReactNode } from "react";
import { Route, Switch, Redirect } from "wouter";
import { trpc } from "./_core/trpc";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import "./theme.css";

/**
 * The console's only guard. It asks the SERVER whether this session is the
 * configured administrator (`panel.session`) rather than trusting anything the
 * client holds — the redirect below is a convenience, not the security boundary.
 */
function Protected({ children }: { children: ReactNode }) {
  const session = trpc.panel.session.useQuery();

  if (session.isLoading) {
    return (
      <div className="panel-page flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
          <p className="panel-caption">Checking your session…</p>
        </div>
      </div>
    );
  }
  if (!session.data?.authenticated) return <Redirect to="/login" />;
  return <>{children}</>;
}

// Routes are deliberately few: this is a single console with tabs, not a site.
export default function App() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/dashboard">
        <Protected>
          <Dashboard />
        </Protected>
      </Route>
      <Route path="/">
        <Protected>
          <Dashboard />
        </Protected>
      </Route>
      <Route>{() => <Redirect to="/" />}</Route>
    </Switch>
  );
}
