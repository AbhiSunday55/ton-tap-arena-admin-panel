import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

/**
 * There is no self-service sign-up for the control panel: its single
 * administrator account is created server-side at first boot, and every panel
 * procedure is gated on that identity. This route is not registered anywhere —
 * it exists only so a stale import cannot break the build.
 */
export default function Signup() {
  return (
    <div className="panel-page flex min-h-screen items-center justify-center px-4">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Registration is closed</CardTitle>
        </CardHeader>
        <CardContent className="panel-caption">
          This console has a single administrator account and no public sign-up. Sign in with the admin password.
        </CardContent>
      </Card>
    </div>
  );
}
