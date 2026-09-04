// ============================================================================
// POST /api/repair-search — TASK #10: Repair vs. Replace + Buy Online pricing
//
// Server-only. Given an item name (+ optional brief description), asks Gemini
// (Google-Search-grounded) for comparable-replacement listings, preferring PH
// retailers/marketplaces. NEVER fabricates a price/shop/source: if the model's
// search text doesn't parse into real listings even after a broadened retry,
// we return NO_RELIABLE_PRICE_FOUND rather than making one up.
//
// After parsing listings, this route also does a best-effort server-side fetch
// of each listing's page to pull a real product photo (og:image) -- Gemini's
// search grounding does not hand back image URLs directly, so this is the only
// way to surface a real "found online" photo instead of leaving it blank.
//
// Repair-cost math (repair vs replace vs savings) stays separate from this
// route -- it composes this data with real/estimated LOCTITE product price
// on the client per PRICE COMPARISON LOGIC in the spec.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { callGeminiSearch, extractJson, GeminiConfigError, GeminiRequestError } from "@/lib/gemini";
import type { PriceListing, RepairVsReplace } from "@/types";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are a shopping-research assistant for a Philippines-focused repair app.
Given an item name, use web search to find CURRENT listings for a comparable/replacement item
for sale in the Philippines (Shopee PH, Lazada PH, official brand stores, reputable PH retailers
preferred). Only report listings you actually found via search -- never invent a price, shop name,
or link.

Almost every everyday consumer item (shoes, bags, phone accessories, school supplies, hobby/craft
items, home decor, motorcycle accessories, etc.) has SOME comparable product for sale online in the
Philippines. You should almost always be able to find at least 2-3 real listings for the closest
matching product category, even if it's not an exact brand/model match -- a reasonably close
substitute in the same category is expected and useful. Only report found:false if the request is
for something that genuinely isn't a real, purchasable physical product category.

Respond with ONLY a single JSON object, no prose, no markdown fences:
{
  "found": boolean,
  "listings": [
    {
      "shopName": string,
      "price": number,          // PHP, numeric only
      "listingTitle": string,
      "sourceUrl": string,      // the real product page URL you found
      "matchConfidence": number // 0..1, how well this listing matches the requested item
    }
  ]
}
Do not pad the list with guesses -- every listing must come from an actual search result.`;

interface GeminiListingsResult {
  found?: boolean;
  listings?: Array<{
    shopName?: string;
    price?: number;
    listingTitle?: string;
    sourceUrl?: string;
    matchConfidence?: number;
  }>;
}

/** Best-effort fetch of a listing page's og:image (or twitter:image) meta tag.
 *  Never throws -- returns null on any failure (timeout, non-HTML, no tag, etc).
 *  This is how listings get a real "found online" photo without ever inventing one. */
async function fetchListingImage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LoctitePHRepairBot/1.0)" },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return null;
    // Only read the first chunk -- og:image is always in <head>, no need to buffer the whole page.
    const reader = res.body?.getReader();
    if (!reader) return null;
    let html = "";
    const decoder = new TextDecoder();
    for (let i = 0; i < 20; i++) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      if (html.length > 60000 || /<\/head>/i.test(html)) break;
    }
    reader.cancel().catch(() => {});
    const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
      ?? html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    const imageUrl = og?.[1];
    if (!imageUrl) return null;
    return new URL(imageUrl, url).toString();
  } catch {
    return null;
  }
}

async function runSearch(itemName: string, context: string | undefined): Promise<GeminiListingsResult | null> {
  const userPrompt = `Item: "${itemName}"${context ? `. Context: ${context}` : ""}. Find comparable replacement prices in the Philippines.`;
  const result = await callGeminiSearch(SYSTEM_PROMPT, userPrompt);
  return extractJson<GeminiListingsResult>(result.text);
}

export async function POST(req: NextRequest) {
  let body: { itemName?: string; itemDescription?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body." }, { status: 400 });
  }

  const itemName = body.itemName?.trim();
  if (!itemName) {
    return NextResponse.json({ error: "itemName is required." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const base: Omit<RepairVsReplace, "status"> = {
    itemName,
    repairCost: null,
    productPricePHP: null,
    comparableReplacementPHP: null,
    potentialSavingsPHP: null,
    listings: [],
    priceRangePHP: null,
    searchTimestamp: now,
  };

  let parsed: GeminiListingsResult | null;
  try {
    parsed = await runSearch(itemName, body.itemDescription);
    // If the first, specific search came back empty, retry once with a broadened,
    // generic version of the query rather than immediately giving up -- this is
    // what keeps template-only flows (generic category, no exact brand/model) from
    // dead-ending on NO_RELIABLE_PRICE_FOUND.
    if (!parsed?.found || !parsed.listings?.length) {
      const broadened = itemName.replace(/\b(rescue|repair|fix)\b/gi, "").trim() || itemName;
      parsed = await runSearch(broadened, "Looking for the general product category, not a specific brand/model.");
    }
  } catch (err) {
    if (err instanceof GeminiConfigError) return NextResponse.json({ error: err.message }, { status: 500 });
    if (err instanceof GeminiRequestError) {
      return NextResponse.json(
        { repairVsReplace: { ...base, status: "PRICE_COMPARISON_UNAVAILABLE" as const } },
        { status: 200 },
      );
    }
    return NextResponse.json({ error: "Unexpected error calling Gemini." }, { status: 500 });
  }

  const rawListings = parsed?.found ? parsed.listings ?? [] : [];

  const candidateListings = rawListings
    .filter((l) => l.shopName && typeof l.price === "number" && l.price > 0 && l.sourceUrl)
    .map((l) => {
      let domain = "";
      try {
        domain = new URL(l.sourceUrl!).hostname;
      } catch {
        domain = "";
      }
      return {
        shopName: l.shopName!,
        price: l.price!,
        currency: "PHP" as const,
        sourceUrl: l.sourceUrl!,
        sourceDomain: domain,
        listingTitle: l.listingTitle ?? itemName,
        imageUrl: null as string | null,
        matchConfidence: typeof l.matchConfidence === "number" ? Math.max(0, Math.min(1, l.matchConfidence)) : 0.5,
        retrievedAt: now,
      };
    })
    .filter((l) => l.sourceDomain !== "");

  if (candidateListings.length === 0) {
    return NextResponse.json({
      repairVsReplace: { ...base, status: "NO_RELIABLE_PRICE_FOUND" as const },
    });
  }

  // Best-effort real product photos for up to the top 3 listings -- never blocks
  // longer than ~5s per listing, and a failed fetch just leaves imageUrl null
  // (the client shows an honest "no photo found" state rather than a fake one).
  const withImages = await Promise.all(
    candidateListings.slice(0, 3).map(async (l) => ({ ...l, imageUrl: await fetchListingImage(l.sourceUrl) })),
  );
  const listings: PriceListing[] = [...withImages, ...candidateListings.slice(3)];

  const prices = listings.map((l) => l.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const comparable = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);

  const repairVsReplace: RepairVsReplace = {
    ...base,
    status: "AVAILABLE",
    comparableReplacementPHP: comparable,
    priceRangePHP: [min, max],
    listings,
    // repairCost/productPrice/savings are filled in by the caller once it
    // knows the recommended product's real/estimated price -- this route
    // only owns the "replace" side of the comparison.
  };

  return NextResponse.json({ repairVsReplace });
}
