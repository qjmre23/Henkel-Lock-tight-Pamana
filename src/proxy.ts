// ============================================================================
// Visit notifier — SERVER-SIDE ONLY (Next.js Proxy, runs as a Netlify Edge
// Function). Sends a short Telegram message when someone opens a page.
// `proxy.ts` is the Next.js 16 convention; `middleware.ts` is deprecated.
//
// Why the server and not a client-side beacon:
//  - The bot token is read from process.env at request time and never reaches
//    the browser. Nothing about this feature is bundled into client JS, so
//    Netlify's secret scanner has nothing to find in the build output.
//  - No cookies, no localStorage, no tracking pixel, no third-party analytics.
//
// What is NOT collected or transmitted:
//  - No IP address. The visitor IP is used only as input to an in-memory,
//    per-day salted SHA-256 hash used to avoid re-notifying the same visitor
//    within DEDUPE_MS. The hash is truncated to 8 bytes, never sent anywhere,
//    and never written to disk.
//  - No raw user-agent, no device/browser fingerprint, no user identifiers,
//    no query strings, no form/photo content.
//
// What IS sent to the site owner's own Telegram chat:
//  - The path visited, the referring site's hostname, a coarse city/country
//    (from Netlify's own geo header), a coarse device class, and a timestamp.
//    This is the same category of information a standard server access log
//    holds, minus the IP.
// ============================================================================

import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";

export const config = {
  matcher: [
    {
      // Page views only: skips API routes, Next internals and static assets.
      source: "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.[\\w]+$).*)",
      // Next.js strips the Flight headers (`rsc`, `next-router-prefetch`, ...)
      // from request.headers inside Proxy, so a prefetch CANNOT be detected in
      // the handler. The matcher is the one place those headers are still
      // visible, so link prefetches are excluded here instead.
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
        { type: "header", key: "sec-purpose", value: "prefetch" },
      ],
    },
  ],
};

const API_BASE = process.env.TELEGRAM_API_BASE || "https://api.telegram.org";
const DEDUPE_MS = 15 * 60 * 1000; // don't re-notify the same visitor within 15 min
const MAX_PER_HOUR = 40;          // hard ceiling so a traffic spike can't spam the chat

// Best-effort, per-instance memory. Serverless instances recycle, so this is a
// spam damper, not a guarantee -- which is why MAX_PER_HOUR exists as a backstop.
const recent = new Map<string, number>();
let hourStart = 0;
let hourCount = 0;

const BOT_UA = /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|preview|monitor|lighthouse|headless|curl|wget|python-requests|axios|node-fetch|uptime|pingdom|semrush|ahrefs/i;

function deviceClass(ua: string): string {
  if (/iPad|Tablet/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|Android/i.test(ua)) return "mobile";
  return "desktop";
}

/** Referrer reduced to a bare hostname, stripped to safe characters. */
function refHost(req: NextRequest): string {
  const r = req.headers.get("referer");
  if (!r) return "direct";
  try {
    const h = new URL(r).hostname.replace(/^www\./, "");
    const safe = h.replace(/[^a-zA-Z0-9.-]/g, "").slice(0, 60);
    return safe || "direct";
  } catch {
    return "direct";
  }
}

/** Coarse location from Netlify's own geo header. Never derived by us from an IP. */
function place(req: NextRequest): string {
  try {
    const raw = req.headers.get("x-nf-geo");
    if (raw) {
      const g = JSON.parse(atob(raw));
      const bits = [g?.city, g?.subdivision?.name || g?.subdivision?.code, g?.country?.name || g?.country?.code]
        .filter((v: unknown): v is string => typeof v === "string" && v.length > 0);
      if (bits.length) return [...new Set(bits)].join(", ").slice(0, 80);
    }
  } catch {
    /* header absent or malformed -- fall through */
  }
  const c = req.headers.get("x-country") || req.headers.get("cf-ipcountry");
  return c ? c.replace(/[^A-Za-z ,.-]/g, "").slice(0, 40) : "unknown";
}

/** Ephemeral, salted, truncated hash used purely for in-memory de-duplication. */
async function visitorKey(req: NextRequest): Promise<string> {
  const ip =
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "no-ip";
  const ua = req.headers.get("user-agent") || "no-ua";
  const day = new Date().toISOString().slice(0, 10); // rotates daily
  const buf = new TextEncoder().encode(`${day}|${ip}|${ua}`);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function manilaTime(d: Date): string {
  try {
    return new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
    }).format(d);
  } catch {
    return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  }
}

async function notify(text: string, token: string, chatId: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // No parse_mode on purpose: the referrer is attacker-controllable input,
      // so it is sent as plain text and can never be interpreted as markup.
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
  } catch {
    /* notification failure must never affect the visitor's page load */
  }
}

// ---------------------------------------------------------------------------
// Credentials come from Netlify environment variables. They are read here, at
// request time, on the server only -- never imported into a client component,
// never prefixed NEXT_PUBLIC_, so they cannot reach the browser bundle.
//
// The two configured names are `locktight_dashboard` (bot token) and
// `metrics_tag` (chat id). Uppercase and TELEGRAM_* spellings are accepted as
// fallbacks, and the two values are auto-sorted by shape, so the feature still
// works if the token and chat id are ever swapped between the two variables.
// ---------------------------------------------------------------------------

const TOKEN_SHAPE = /^\d{5,}:[A-Za-z0-9_-]{20,}$/;

function firstSet(...vals: (string | undefined)[]): string | undefined {
  for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}

function readConfig(): { token?: string; chatId?: string } {
  // Static property access (not dynamic indexing) so the Edge bundler resolves these.
  const a = firstSet(
    process.env.locktight_dashboard,
    process.env.LOCKTIGHT_DASHBOARD,
    process.env.TELEGRAM_BOT_TOKEN,
  );
  const b = firstSet(
    process.env.metrics_tag,
    process.env.METRICS_TAG,
    process.env.TELEGRAM_CHAT_ID,
  );
  if (a && TOKEN_SHAPE.test(a)) return { token: a, chatId: b };
  if (b && TOKEN_SHAPE.test(b)) return { token: b, chatId: a }; // swapped -> corrected
  return { token: a, chatId: b };
}

export async function proxy(req: NextRequest, event: NextFetchEvent) {
  const res = NextResponse.next();

  const { token, chatId } = readConfig();
  if (!token || !chatId) return res; // feature simply off when unconfigured

  if (req.method !== "GET") return res;

  // (Prefetches are already excluded by config.matcher above.)


  const ua = req.headers.get("user-agent") || "";
  if (!ua || BOT_UA.test(ua)) return res;

  const now = Date.now();
  if (now - hourStart > 3_600_000) { hourStart = now; hourCount = 0; }
  if (hourCount >= MAX_PER_HOUR) return res;

  const key = await visitorKey(req);
  const last = recent.get(key);
  if (last && now - last < DEDUPE_MS) return res;
  recent.set(key, now);
  if (recent.size > 800) {
    for (const [k, v] of recent) if (now - v > DEDUPE_MS) recent.delete(k);
  }
  hourCount += 1;

  const path = req.nextUrl.pathname.replace(/[^\w/-]/g, "").slice(0, 60) || "/";
  const text = [
    "PAMANA — new visit",
    `Page: ${path}`,
    `From: ${refHost(req)}`,
    `Where: ${place(req)}`,
    `Device: ${deviceClass(ua)}`,
    `Time: ${manilaTime(new Date())}`,
  ].join("\n");

  // Fire-and-forget so the visitor never waits on Telegram.
  if (typeof event?.waitUntil === "function") event.waitUntil(notify(text, token, chatId));
  else void notify(text, token, chatId);

  return res;
}
