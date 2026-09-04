// ============================================================================
// Gemini client — server-only. Never import this from a Client Component.
// GEMINI_API_KEY is read from process.env here and never sent to the browser.
//
// Two entry points:
//  - callGeminiVision: image + text -> JSON-forced text response (damage detection).
//  - callGeminiSearch: Google-Search-grounded text response w/ citations (live PH
//    pricing for Repair vs. Replace / Buy Online). Request/response shape follows
//    https://ai.google.dev/gemini-api/docs/google-search (tools: [{ google_search: {} }],
//    groundingMetadata.groundingChunks[].web.uri for citations). Callers (see
//    /api/repair-search) chain multiple callGeminiSearch invocations of increasing
//    breadth -- specific listing, broadened category, then a pure price-estimate
//    query -- so a narrow first search never dead-ends the whole flow.
// ============================================================================

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export class GeminiConfigError extends Error {}
export class GeminiRequestError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new GeminiConfigError("GEMINI_API_KEY is not set. Add it to .env.local (dev) or Netlify env vars (prod).");
  }
  return key;
}

interface GeminiPart {
  text?: string;
}

async function extractGeminiText(res: Response): Promise<string> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GeminiRequestError(`Gemini API error ${res.status}: ${body.slice(0, 500)}`, res.status);
  }
  const data = await res.json();
  const candidate = data?.candidates?.[0];
  if (candidate?.finishReason === "SAFETY" || candidate?.finishReason === "RECITATION") {
    throw new GeminiRequestError(`Gemini declined to respond (${candidate.finishReason}).`);
  }
  const parts: GeminiPart[] = candidate?.content?.parts ?? [];
  const text = parts.map((p) => p?.text ?? "").join("");
  if (!text.trim()) {
    throw new GeminiRequestError("Gemini returned an empty response.");
  }
  return text;
}

/**
 * Vision call: system prompt + image (data URI) + user text -> raw JSON-ish text.
 * Forces responseMimeType: "application/json" so the model returns clean JSON --
 * still defensively parsed with extractJson() by the caller, never trusted blindly.
 */
export async function callGeminiVision(
  systemPrompt: string,
  userText: string,
  imageDataUrl: string,
  opts: { maxTokens?: number } = {},
): Promise<string> {
  const apiKey = getApiKey();
  const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new GeminiRequestError("imageDataUrl must be a data:image/...;base64,... URI.");
  }
  const [, mimeType, base64Data] = match;

  const res = await fetch(`${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [
        {
          role: "user",
          parts: [{ text: userText }, { inline_data: { mime_type: mimeType, data: base64Data } }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: opts.maxTokens ?? 1200,
        responseMimeType: "application/json",
        // Gemini 2.5 Flash "thinks" by default, which eats into the same output-token
        // budget and can hit MAX_TOKENS before any visible text is produced. Disabled
        // here -- this is a simple extraction task, not multi-step reasoning.
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
    cache: "no-store",
  });

  return extractGeminiText(res);
}

export interface GeminiSearchResult {
  text: string;
  citations: string[];
}

/**
 * Google-Search-grounded call: system + user prompt -> { text, citations }.
 * Grounding (tools: [{ google_search: {} }]) cannot be combined with a forced
 * responseMimeType in the current API, so the system prompt must instruct
 * JSON-only output and the caller parses defensively with extractJson().
 */
export async function callGeminiSearch(
  systemPrompt: string,
  userPrompt: string,
  opts: { maxTokens?: number } = {},
): Promise<GeminiSearchResult> {
  const apiKey = getApiKey();

  const res = await fetch(`${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: opts.maxTokens ?? 2048,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GeminiRequestError(`Gemini search error ${res.status}: ${body.slice(0, 500)}`, res.status);
  }
  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const parts: GeminiPart[] = candidate?.content?.parts ?? [];
  const text = parts.map((p) => p?.text ?? "").join("");

  interface GroundingChunk {
    web?: { uri?: string };
  }
  const chunks: GroundingChunk[] = candidate?.groundingMetadata?.groundingChunks ?? [];
  const citations: string[] = chunks
    .map((c) => c?.web?.uri)
    .filter((u): u is string => typeof u === "string");

  if (!text.trim()) {
    throw new GeminiRequestError("Gemini search returned no text output.");
  }
  return { text, citations };
}

/**
 * Extracts the first {...} JSON object from a model response and parses it.
 * Defensive, never throws -- returns null on malformed/missing JSON so callers
 * can route to a NEED_MORE_INFO / unavailable state instead of guessing.
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
