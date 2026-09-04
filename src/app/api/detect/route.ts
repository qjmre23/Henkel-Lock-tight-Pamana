// ============================================================================
// POST /api/detect — TASK #7 / #8
//
// Server-only. Accepts a photo (+ optional free-text Taglish/English
// description) and asks Gemini vision to DESCRIBE it -- object, material,
// damage, application, confidence, and a normalized damage bounding box.
//
// Division of responsibility (per spec): the vision model only describes. It
// never draws anything and never picks a product. This route:
//   1. Calls Gemini, defensively parses its JSON.
//   2. Runs the deterministic repairability check (src/lib/recommend.ts) --
//      NOT the model -- to decide SUITABLE / NEED_MORE_INFO / NOT_RECOMMENDED.
//   3. Returns a DamageAssessment. The client renders the overlay itself
//      (SVG, mapping damageRegion onto the rendered image's pixel size).
// If the model's coordinates are missing/malformed, damageRegion is null and
// the client is expected to fall back to its NEED MORE INFO state.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { callGeminiVision, extractJson, GeminiConfigError, GeminiRequestError } from "@/lib/gemini";
import { checkRepairability } from "@/lib/recommend";
import type { DamageAssessment, DamageRegion } from "@/types";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are a vision system for a repair-diagnosis app. You are shown a photo of a
possibly-broken everyday item (shoes, bags, phone cases, cosplay props, school supplies, etc.)
and optionally a short free-text description from the user, which may be in Filipino/Taglish
(e.g. "natanggal yung sole", "bumuka yung gilid", "may crack dito", "napigtas yung strap").

Your ONLY job is to describe what you see. You never suggest a specific glue/adhesive product
and you never draw anything -- you only return coordinates as data.

Respond with ONLY a single JSON object, no prose, no markdown fences, matching exactly this shape:
{
  "object": string,                 // e.g. "Sneaker" -- your best guess at what the item is
  "isRepairCandidate": boolean,     // false for people, animals, food, or anything that isn't a repairable object
  "material": string | null,        // e.g. "Rubber + fabric"
  "damage": string | null,          // a SPECIFIC, visually-grounded description of exactly what's wrong
                                     // and roughly where on the item -- not just a category label. Write it
                                     // the way you'd explain it to the item's owner after really looking at
                                     // the photo, e.g. "Sole separation at the toe, upper peeling away from
                                     // the outsole" rather than just "Sole separation". This exact text is
                                     // shown to the user as your explanation, so be concrete about location,
                                     // extent, and visible detail -- but never invent damage you can't see.
  "damageType": "SOLE_SEPARATION" | "BROKEN_PART" | "LOOSE_TRIM" | "CRACK" | "OTHER" | null,
  "application": string | null,     // the repair action needed, e.g. "Reattach separated sole to upper"
  "confidence": number,             // 0..1 overall confidence in this detection
  "damageRegion": { "x": number, "y": number, "width": number, "height": number } | null
    // normalized 0..1 bounding box of the damaged area relative to the image, top-left origin.
    // Return null if you cannot localize the damage confidently -- never guess.
}
If the user's text conflicts with what the image shows, prefer the image but factor in the text
when normalizing the damage description. Interpret Filipino/Taglish naturally.`;

interface GeminiVisionResult {
  object?: string;
  isRepairCandidate?: boolean;
  material?: string | null;
  damage?: string | null;
  damageType?: DamageAssessment["damageType"];
  application?: string | null;
  confidence?: number;
  damageRegion?: Partial<DamageRegion> | null;
}

function isValidRegion(r: Partial<DamageRegion> | null | undefined): r is DamageRegion {
  if (!r) return false;
  const nums = [r.x, r.y, r.width, r.height];
  if (nums.some((n) => typeof n !== "number" || Number.isNaN(n))) return false;
  const [x, y, w, h] = nums as number[];
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 && w > 0 && w <= 1 && h > 0 && h <= 1;
}

export async function POST(req: NextRequest) {
  let body: { imageDataUrl?: string; text?: string; sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body." }, { status: 400 });
  }

  const { imageDataUrl, text, sessionId } = body;
  if (!imageDataUrl || !imageDataUrl.startsWith("data:image/")) {
    return NextResponse.json({ error: "imageDataUrl (data:image/... base64) is required." }, { status: 400 });
  }

  const userText = text?.trim()
    ? `User's description: "${text.trim()}"`
    : "No text description was provided -- use the image alone.";

  let raw: string;
  try {
    raw = await callGeminiVision(SYSTEM_PROMPT, userText, imageDataUrl, { maxTokens: 800 });
  } catch (err) {
    if (err instanceof GeminiConfigError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    if (err instanceof GeminiRequestError) {
      return NextResponse.json({ error: "Gemini request failed.", detail: err.message }, { status: 502 });
    }
    return NextResponse.json({ error: "Unexpected error calling Gemini." }, { status: 500 });
  }

  const parsed = extractJson<GeminiVisionResult>(raw);

  const now = new Date().toISOString();
  const assessment: DamageAssessment = {
    id: crypto.randomUUID(),
    sessionId: sessionId ?? crypto.randomUUID(),
    object: parsed?.object?.trim() || "",
    isRepairCandidate: parsed?.isRepairCandidate ?? false,
    material: parsed?.material?.trim() || null,
    damage: parsed?.damage?.trim() || null,
    damageType: parsed?.damageType ?? null,
    application: parsed?.application?.trim() || null,
    confidence: typeof parsed?.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0,
    // Malformed/missing coordinates -> null. The client must not guess a position.
    damageRegion: isValidRegion(parsed?.damageRegion) ? (parsed!.damageRegion as DamageRegion) : null,
    userText: text?.trim() || null,
    repairability: "NEED_MORE_INFO", // placeholder, computed below
    userConfirmed: false,
    createdAt: now,
  };

  // The vision model never decides suitability -- the deterministic rules engine does
  // (TASK #4). If its own JSON was unparseable entirely, force NEED_MORE_INFO rather
  // than running the rules engine against empty/garbage data.
  assessment.repairability = parsed ? checkRepairability(assessment) : "NEED_MORE_INFO";

  return NextResponse.json({ assessment, geminiParsedOk: parsed !== null });
}
