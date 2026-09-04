// ============================================================================
// Grok client — server-only. Never import this from a Client Component.
// GROK_API_KEY is read from process.env here and never sent to the browser.
// ============================================================================

const GROK_API_URL = "https://api.x.ai/v1/chat/completions";
const GROK_MODEL = process.env.GROK_MODEL || "grok-4";

interface GrokMessage {
  role: "system" | "user";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }
      >;
}

export class GrokConfigError extends Error {}
export class GrokRequestError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

/** Low-level call to the Grok chat completions endpoint. Server-only. */
export async function callGrok(messages: GrokMessage[], opts: { maxTokens?: number } = {}): Promise<string> {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) {
    throw new GrokConfigError("GROK_API_KEY is not set. Add it to .env.local (dev) or Netlify env vars (prod).");
  }

  const res = await fetch(GROK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROK_MODEL,
      messages,
      max_tokens: opts.maxTokens ?? 600,
      temperature: 0.2,
    }),
    // Never cache a model call.
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GrokRequestError(`Grok API error ${res.status}: ${body.slice(0, 500)}`, res.status);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new GrokRequestError("Grok returned an empty response.");
  }
  return content;
}

/**
 * Extracts the first {...} JSON object from a model response and parses it.
 * Grok is instructed to return JSON-only, but models sometimes wrap output
 * in prose or code fences -- this is defensive, not a substitute for good
 * prompting. Returns null (never throws) on any malformed/missing JSON so
 * callers can route to a NEED_MORE_INFO state instead of guessing.
 */
export function extractJson<T = unknown>(raw: string): T | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------
// Grok Responses API + web_search tool (TASK #10 — Repair vs. Replace pricing,
// and general PH price lookups for "Buy Online"). Docs: docs.x.ai/developers/
// tools/web-search. This endpoint/shape is newer than /v1/chat/completions and
// its exact response envelope was not verifiable from this sandboxed session
// (outbound network to api.x.ai is blocked here by the session's egress
// policy) -- the parsing below is defensive and handles a few plausible
// shapes. VERIFY against a live call before shipping (see task.md).
// ----------------------------------------------------------------------------

const GROK_RESPONSES_URL = "https://api.x.ai/v1/responses";

export interface GrokSearchResult {
  text: string;
  citations: string[];
}

export async function callGrokWebSearch(
  systemPrompt: string,
  userPrompt: string,
  opts: { allowedDomains?: string[] } = {},
): Promise<GrokSearchResult> {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) {
    throw new GrokConfigError("GROK_API_KEY is not set. Add it to .env.local (dev) or Netlify env vars (prod).");
  }

  const tool: Record<string, unknown> = { type: "web_search" };
  if (opts.allowedDomains?.length) tool.allowed_domains = opts.allowedDomains.slice(0, 5);

  const res = await fetch(GROK_RESPONSES_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: GROK_MODEL,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [tool],
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GrokRequestError(`Grok web search error ${res.status}: ${body.slice(0, 500)}`, res.status);
  }

  const data = await res.json();

  // Defensive extraction across plausible Responses-API shapes.
  let text = "";
  if (typeof data.output_text === "string") {
    text = data.output_text;
  } else if (Array.isArray(data.output)) {
    for (const item of data.output) {
      const contents = item?.content;
      if (Array.isArray(contents)) {
        for (const c of contents) {
          if (typeof c?.text === "string") text += c.text;
        }
      }
    }
  } else if (data?.choices?.[0]?.message?.content) {
    text = String(data.choices[0].message.content);
  }

  const citations: string[] = Array.isArray(data.citations)
    ? data.citations.filter((c: unknown) => typeof c === "string")
    : [];

  if (!text.trim()) {
    throw new GrokRequestError("Grok web search returned no text output.");
  }
  return { text, citations };
}
