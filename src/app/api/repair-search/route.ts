// ============================================================================
// POST /api/repair-search — TASK #10: Repair vs. Replace + Buy Online pricing
//
// Server-only. Given an item name (+ optional brief description), asks Gemini
// (Google-Search-grounded, per https://ai.google.dev/gemini-api/docs/google-search)
// for comparable-replacement listings, preferring PH retailers/marketplaces.
// NEVER fabricates a price/shop/source as a "real listing" -- but this route
// also never dead-ends the UI on a bare "unavailable" screen. It orchestrates
// four tiers, each attempted independently of whether the previous one threw
// or just came back empty:
//
//   1. Specific listing search      -- itemName as given.
//   2. Broadened listing search     -- itemName with branding words stripped
//                                       ("Sneaker Rescue" -> "Sneaker").
//   3. Category price-ESTIMATE search -- still Gemini + Google Search, but
//                                       asks for a typical market range for
//                                       the general category rather than
//                                       individual verified listings. A much
//                                       lower bar to clear than tier 1/2, so
//                                       it succeeds far more often.
//   4. Static per-template fallback -- only reached if live search itself is
//                                       fully unavailable/exhausted (network
//                                       down, no API key, tiers 1-3 all threw
//                                       or came back empty). Uses the
//                                       template's fallbackReplacementRangePHP
//                                       if the caller supplied one.
//
// Tiers 1-2 produce status "AVAILABLE" (real, sourced listings). Tiers 3-4
// produce status "ESTIMATE_ONLY" with estimateSource "search" / "fallback"
// respectively and a human-readable estimateNote -- the client always labels
// these as estimates, never as verified listings. Only if literally nothing
// (no listings, no estimate, no fallback range) is available do we return
// NO_RELIABLE_PRICE_FOUND.
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
import { callGeminiSearch, extractJson } from "@/lib/gemini";
import type { PriceListing, RepairVsReplace } from "@/types";

export const runtime = "nodejs";

const LISTINGS_SYSTEM_PROMPT = `You are a shopping-research assistant for a Philippines-focused repair app.
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

const ESTIMATE_SYSTEM_PROMPT = `You are a pricing-research assistant for a Philippines-focused repair app.
You were unable to pin down individual verified listings for a specific item, so instead: use web
search to find what items in this GENERAL category typically sell for right now in the Philippines
(Shopee PH, Lazada PH, or physical retailers). This is a rough market range, not a specific product
match -- look at a handful of similar/comparable items in this category and summarize the range you
see, in Philippine Pesos.

Nearly every everyday consumer item category has SOME typical price range findable via search --
only report found:false if this genuinely is not a real, purchasable physical product category.

Respond with ONLY a single JSON object, no prose, no markdown fences:
{
  "found": boolean,
  "lowPHP": number,     // low end of the typical range you found, PHP, numeric only
  "highPHP": number,    // high end of the typical range you found, PHP, numeric only
  "typicalPHP": number, // a representative/typical price within that range, PHP
  "basis": string       // one short sentence on what you searched, e.g. "Based on Shopee PH listings for similar rubber slippers"
}`;

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

interface GeminiEstimateResult {
  found?: boolean;
  lowPHP?: number;
  highPHP?: number;
  typicalPHP?: number;
  basis?: string;
}

/** Runs an async search step and swallows ANY failure (thrown GeminiRequestError/
 *  GeminiConfigError, network error, malformed JSON) into `null` so a failure in
 *  one tier never prevents the next, broader tier from being attempted. */
async function safely<T>(fn: () => Promise<T | null>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

/** Pulls a product image out of a page's <head> meta tags (og:image,
 *  twitter:image, itemprop="image") OR, failing that, a schema.org Product
 *  JSON-LD block (<script type="application/ld+json">) -- e-commerce SEO
 *  pages very often carry structured Product data with an "image" field even
 *  when the visible page itself is a JS-rendered shell without plain meta
 *  tags, so JSON-LD is what actually surfaces a real photo for a lot of
 *  Shopee/Lazada-style listings that simple og:image scraping misses. */
function extractProductImage(html: string, baseUrl: string): string | null {
  const metaPatterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
    /<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/i,
  ];
  for (const pattern of metaPatterns) {
    const m = html.match(pattern);
    if (m?.[1]) {
      try {
        return new URL(m[1], baseUrl).toString();
      } catch {
        // fall through to try other patterns / JSON-LD
      }
    }
  }

  // Fallback: schema.org Product structured data. There may be several
  // JSON-LD blocks on the page (breadcrumbs, org info, etc.) -- scan all of
  // them for one that looks like a Product with an image.
  const ldBlocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of ldBlocks) {
    try {
      const parsed: unknown = JSON.parse(block[1].trim());
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of candidates) {
        if (!node || typeof node !== "object") continue;
        const obj = node as Record<string, unknown>;
        const type = obj["@type"];
        const isProduct = type === "Product" || (Array.isArray(type) && type.includes("Product"));
        if (!isProduct) continue;
        const img = obj.image;
        const imageUrl = typeof img === "string" ? img
          : Array.isArray(img) && typeof img[0] === "string" ? img[0]
          : img && typeof img === "object" && typeof (img as Record<string, unknown>).url === "string" ? (img as Record<string, unknown>).url as string
          : null;
        if (imageUrl) {
          try {
            return new URL(imageUrl, baseUrl).toString();
          } catch {
            continue;
          }
        }
      }
    } catch {
      continue; // malformed JSON-LD -- skip this block, try the next
    }
  }
  return null;
}

/** Best-effort fetch of a listing page's product photo (see extractProductImage).
 *  Never throws -- returns null on any failure (timeout, non-HTML, no image
 *  found, etc). This is how listings get a real "found online" photo without
 *  ever inventing one. Uses a crawler-style User-Agent because e-commerce
 *  sites commonly serve full server-rendered metadata to known social/search
 *  crawlers specifically so link previews work, even when a regular browser
 *  UA gets a mostly-empty JS-rendered shell. */
async function fetchListingImage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)" },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return null;
    // JSON-LD Product blocks can sit anywhere in the document (not just
    // <head>), so read a generous chunk of the page rather than stopping at
    // </head> -- capped so one slow/huge page can't stall the request.
    const reader = res.body?.getReader();
    if (!reader) return null;
    let html = "";
    const decoder = new TextDecoder();
    for (let i = 0; i < 60; i++) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      if (html.length > 250000) break;
    }
    reader.cancel().catch(() => {});
    return extractProductImage(html, url);
  } catch {
    return null;
  }
}

async function runListingsSearch(itemName: string, context: string | undefined): Promise<GeminiListingsResult | null> {
  const userPrompt = `Item: "${itemName}"${context ? `. Context: ${context}` : ""}. Find comparable replacement prices in the Philippines.`;
  const result = await callGeminiSearch(LISTINGS_SYSTEM_PROMPT, userPrompt);
  return extractJson<GeminiListingsResult>(result.text);
}

async function runEstimateSearch(categoryName: string): Promise<GeminiEstimateResult | null> {
  const userPrompt = `Item category: "${categoryName}". What's the typical retail price range for this in the Philippines right now?`;
  const result = await callGeminiSearch(ESTIMATE_SYSTEM_PROMPT, userPrompt, { maxTokens: 800 });
  return extractJson<GeminiEstimateResult>(result.text);
}

function broadenQuery(itemName: string): string {
  return itemName.replace(/\b(rescue|repair|fix)\b/gi, "").trim() || itemName;
}

export async function POST(req: NextRequest) {
  let body: { itemName?: string; itemDescription?: string; fallbackRangePHP?: [number, number] | null };
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
    estimateNote: null,
    estimateSource: null,
  };

  // ---- Tier 1: specific listing search ----------------------------------
  let parsed = await safely(() => runListingsSearch(itemName, body.itemDescription));

  // ---- Tier 2: broadened listing search (retried on empty OR on failure) --
  if (!parsed?.found || !parsed.listings?.length) {
    const broadened = broadenQuery(itemName);
    parsed = await safely(() =>
      runListingsSearch(broadened, "Looking for the general product category, not a specific brand/model."),
    );
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

  if (candidateListings.length > 0) {
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

  // ---- Tier 3: category price-ESTIMATE search (search-grounded, lower bar) --
  const estimate = await safely(() => runEstimateSearch(broadenQuery(itemName)));
  if (
    estimate?.found &&
    typeof estimate.lowPHP === "number" && estimate.lowPHP > 0 &&
    typeof estimate.highPHP === "number" && estimate.highPHP >= estimate.lowPHP &&
    typeof estimate.typicalPHP === "number" && estimate.typicalPHP > 0
  ) {
    const repairVsReplace: RepairVsReplace = {
      ...base,
      status: "ESTIMATE_ONLY",
      comparableReplacementPHP: Math.round(estimate.typicalPHP),
      priceRangePHP: [Math.round(estimate.lowPHP), Math.round(estimate.highPHP)],
      listings: [],
      estimateNote: estimate.basis?.trim() || "General market range for this category found via search -- not a specific verified listing.",
      estimateSource: "search",
    };
    return NextResponse.json({ repairVsReplace });
  }

  // ---- Tier 4: static per-template fallback (live search fully unavailable) --
  const fallback = body.fallbackRangePHP;
  if (Array.isArray(fallback) && fallback.length === 2) {
    const [low, high] = fallback;
    if (typeof low === "number" && low > 0 && typeof high === "number" && high >= low) {
      const repairVsReplace: RepairVsReplace = {
        ...base,
        status: "ESTIMATE_ONLY",
        comparableReplacementPHP: Math.round((low + high) / 2),
        priceRangePHP: [low, high],
        listings: [],
        estimateNote: "Live price search was unavailable right now -- this is a general market range for this category, not a specific verified listing.",
        estimateSource: "fallback",
      };
      return NextResponse.json({ repairVsReplace });
    }
  }

  // ---- Nothing usable anywhere ----
  return NextResponse.json({
    repairVsReplace: { ...base, status: "NO_RELIABLE_PRICE_FOUND" as const },
  });
}
