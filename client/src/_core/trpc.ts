import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../../server/routers";

// Typed tRPC client. `AppRouter` is a TYPE-ONLY import from the server, so the
// whole API is end-to-end typed without shipping server code to the browser.
export const trpc = createTRPCReact<AppRouter>();

export function makeTrpcClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: "/trpc",
        transformer: superjson,
        // The session cookie is `httpOnly`, so the browser will not attach it to
        // a cross-origin request unless sent explicitly, and a published preview
        // is cross-origin to the API (it is served through a proxy host).
        // `include` costs nothing same-origin and is required otherwise — without
        // it, sign-in appears to succeed (the server returns ok and sets the
        // cookie) while every subsequent request looks anonymous, because the
        // cookie never came back. That failure reads as "the password doesn't
        // work" and is worth this comment.
        fetch: (input, init) =>
          fetch(input, { ...init, credentials: "include" }),
      }),
    ],
  });
}
