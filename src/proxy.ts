// ============================================================================
// Intentionally a no-op pass-through.
//
// The visit notifier used to live here. It does not work on Netlify: Next.js 16
// renamed `middleware.ts` to `proxy.ts` and stopped registering it in
// `.next/server/middleware-manifest.json`, which is the file
// @netlify/plugin-nextjs@5 reads to create the middleware edge function. The
// result is that a Next 16 proxy is compiled into the build but never deployed,
// so it silently never runs in production (it does run under `next start`,
// which is what made this easy to miss).
//
// The notifier now lives in `netlify/edge-functions/visit-notify.ts`, a native
// Netlify edge function that Netlify deploys itself and which therefore does
// not depend on Next.js or plugin versions.
//
// This file is deliberately kept (rather than deleted) so the reason is
// discoverable, and kept inert so that if a future plugin version DOES start
// deploying Next 16 proxies, visits are not notified twice.
// ============================================================================

import { NextResponse } from "next/server";

export function proxy() {
  return NextResponse.next();
}

export const config = { matcher: ["/__inert-never-matches__"] };
