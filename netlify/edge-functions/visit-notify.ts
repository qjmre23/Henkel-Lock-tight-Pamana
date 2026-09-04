// ============================================================================
// Visit notifier — native Netlify Edge Function. SERVER-SIDE ONLY.
//
// Why this is not a Next.js proxy/middleware:
//   Next.js 16 renamed `middleware.ts` to `proxy.ts` and no longer registers it
//   in `.next/server/middleware-manifest.json`. @netlify/plugin-nextjs@5 reads
//   exactly that manifest to create the middleware edge function, so a Next 16
//   `proxy.ts` is compiled but never deployed — it silently never runs.
//   A native Netlify edge function is deployed by Netlify itself and is
//   therefore immune to Next.js/plugin version drift.
//
// PRIVACY
//   Sent to the owner's own Telegram chat: path, referrer hostname, coarse
//   city/country (from Netlify's own geo context), device class, timestamp.
//   NOT collected, stored or transmitted: IP addresses, raw user-agent,
//   cookies, query strings, identifiers, or any uploaded content. The visitor
//   IP is used only as input to an in-memory, day-salted SHA-256 hash,
//   truncated to 8 bytes, to avoid re-notifying the same visitor within
//   DEDUPE_MS. No cookies, no localStorage, no third-party analytics.
// ============================================================================

import type { Config, Context } from "https://edge.netlify.com";

const DEDUPE_MS = 15 * 60 * 1000;
const MAX_PER_HOUR = 40;

const recent = new Map<string, number>();
let hourStart = 0;
let hourCount = 0;

const BOT_UA =
  /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|preview|monitor|lighthouse|headless|curl|wget|python-requests|axios|node-fetch|uptime|pingdom|semrush|ahrefs|dataprovider|scrapy/i;

function env(name: string): string | undefined {
  try {
    // deno-lint-ignore no-explicit-any
    const v = (globalThis as any).Netlify?.env?.get?.(name) ?? (globalThis as any).Deno?.env?.get?.(name);
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  } catch {
    return undefined;
  }
}

const TOKEN_SHAPE = /^\d{5,}:[A-Za-z0-9_-]{20,}$/;   // 8123456789:AAF...
const CHAT_SHAPE = /^(-?\d{4,}|@[A-Za-z][A-Za-z0-9_]{4,})$/; // numeric id, or @publicchannel

// Every variable name this project has used for the two Telegram values.
// Which value lives under which name has changed more than once, so instead of
// trusting the name we read them all and classify by SHAPE: a bot token always
// looks like "<digits>:<base64ish>", a chat id is numeric (or @channel).
const CANDIDATE_NAMES = [
  "notifieer_tag", "NOTIFIEER_TAG",
  "metrics_tag", "METRICS_TAG",
  "locktight_dashboard", "LOCKTIGHT_DASHBOARD",
  "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID",
];

interface ResolvedConfig {
  token?: string;
  chatId?: string;
  tokenVar?: string;
  chatIdVar?: string;
  foundVars: string[];
}

function readConfig(): ResolvedConfig {
  const found: { name: string; value: string }[] = [];
  for (const n of CANDIDATE_NAMES) {
    const v = env(n);
    if (v && !found.some((f) => f.value === v)) found.push({ name: n, value: v });
  }

  let token: string | undefined, tokenVar: string | undefined;
  for (const f of found) {
    if (!token && TOKEN_SHAPE.test(f.value)) { token = f.value; tokenVar = f.name; }
  }

  let chatId: string | undefined, chatIdVar: string | undefined;
  for (const f of found) {
    if (f.name === tokenVar) continue;
    if (!chatId && CHAT_SHAPE.test(f.value)) { chatId = f.value; chatIdVar = f.name; }
  }
  // Last resort: any remaining value that is not the token, so a malformed
  // chat id still reaches Telegram and surfaces a real error via /__vn-test
  // instead of failing silently here.
  if (!chatId) {
    for (const f of found) {
      if (f.name !== tokenVar) { chatId = f.value; chatIdVar = f.name; break; }
    }
  }
  return { token, chatId, tokenVar, chatIdVar, foundVars: found.map((f) => f.name) };
}

function deviceClass(ua: string): string {
  if (/iPad|Tablet/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|Android/i.test(ua)) return "mobile";
  return "desktop";
}

/** Referrer reduced to a bare hostname and stripped to safe characters. */
function refHost(request: Request): string {
  const r = request.headers.get("referer");
  if (!r) return "direct";
  try {
    const h = new URL(r).hostname.replace(/^www\./, "");
    return h.replace(/[^a-zA-Z0-9.-]/g, "").slice(0, 60) || "direct";
  } catch {
    return "direct";
  }
}

function place(context: Context): string {
  const g = context.geo;
  const bits = [g?.city, g?.subdivision?.name, g?.country?.name].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  return bits.length ? [...new Set(bits)].join(", ").slice(0, 80) : "unknown";
}

async function visitorKey(request: Request, context: Context): Promise<string> {
  const ip = context.ip || request.headers.get("x-nf-client-connection-ip") || "no-ip";
  const ua = request.headers.get("user-agent") || "no-ua";
  const day = new Date().toISOString().slice(0, 10);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${day}|${ip}|${ua}`));
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

async function send(token: string, chatId: string, text: string): Promise<{ ok: boolean; description?: string }> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // No parse_mode: the referrer is attacker-controllable, so it is sent as
      // plain text and can never be interpreted as Telegram markup.
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: !!j?.ok, description: j?.description };
  } catch (e) {
    return { ok: false, description: String(e) };
  }
}

export default async (request: Request, context: Context): Promise<Response | void> => {
  const url = new URL(request.url);
  const cfg = readConfig();
  const { token, chatId } = cfg;

  // ---- diagnostics (no secret values are ever returned) --------------------
  if (url.pathname === "/__vn-status") {
    return Response.json({
      edgeFunction: "running",
      foundVars: cfg.foundVars,          // names only, never values
      tokenVar: cfg.tokenVar ?? null,
      chatIdVar: cfg.chatIdVar ?? null,
      hasToken: !!token,
      tokenLooksValid: token ? TOKEN_SHAPE.test(token) : false,
      hasChatId: !!chatId,
      chatIdLooksValid: chatId ? CHAT_SHAPE.test(chatId) : false,
      geo: place(context),
      time: manilaTime(new Date()),
    });
  }
  if (url.pathname === "/__vn-test") {
    if (!token || !chatId) return Response.json({ ok: false, error: "env vars missing", hasToken: !!token, hasChatId: !!chatId });
    const r = await send(token, chatId, "PAMANA visit notifier: test message. If you can read this, notifications work.");
    return Response.json(r);
  }

  if (!token || !chatId) return; // feature off when unconfigured

  // ---- real visits ---------------------------------------------------------
  if (request.method !== "GET") return;
  const accept = request.headers.get("accept") || "";
  if (!accept.includes("text/html")) return; // documents only, not assets/RSC fetches

  const sp = (request.headers.get("sec-purpose") || "").toLowerCase();
  if (sp.includes("prefetch") || sp.includes("prerender")) return;
  if (request.headers.get("purpose")?.toLowerCase() === "prefetch") return;
  if (request.headers.get("next-router-prefetch")) return;
  if (request.headers.get("rsc")) return;

  const ua = request.headers.get("user-agent") || "";
  if (!ua || BOT_UA.test(ua)) return;

  const now = Date.now();
  if (now - hourStart > 3_600_000) { hourStart = now; hourCount = 0; }
  if (hourCount >= MAX_PER_HOUR) return;

  const key = await visitorKey(request, context);
  const last = recent.get(key);
  if (last && now - last < DEDUPE_MS) return;
  recent.set(key, now);
  if (recent.size > 800) for (const [k, v] of recent) if (now - v > DEDUPE_MS) recent.delete(k);
  hourCount += 1;

  const path = url.pathname.replace(/[^\w/-]/g, "").slice(0, 60) || "/";
  const text = [
    "PAMANA — new visit",
    `Page: ${path}`,
    `From: ${refHost(request)}`,
    `Where: ${place(context)}`,
    `Device: ${deviceClass(ua)}`,
    `Time: ${manilaTime(new Date())}`,
  ].join("\n");

  // Fire-and-forget: the visitor never waits on Telegram.
  context.waitUntil(send(token, chatId, text));
};

export const config: Config = {
  path: "/*",
  excludedPath: ["/_next/*", "/api/*", "/static/*", "/*.ico", "/*.png", "/*.jpg", "/*.jpeg", "/*.svg", "/*.webp", "/*.css", "/*.js", "/*.txt", "/*.xml", "/*.woff2"],
};
