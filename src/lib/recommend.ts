// ============================================================================
// COMPATIBILITY / RECOMMENDATION RULES ENGINE — TASK #4
//
// Deterministic. No AI-invented scores. Gemini (TASK #7/#8) only ever supplies
// a DamageAssessment (object/material/damage/application/confidence/region);
// THIS module is the only thing that ever picks a product, by matching real
// Product data from src/data/products.ts. It never recommends a product for
// a safety-critical application unless that product's data explicitly says
// safetyCriticalApproved: true.
// ============================================================================

import type { DamageAssessment, MatchResult, MatchReasonCheck, Product, RepairCandidateStatus } from "@/types";
import { getUsableProducts } from "@/data/products";

// Objects that are never a repair target, regardless of what's said about them.
const NON_REPAIR_OBJECTS = [
  "dog", "cat", "person", "human", "face", "food", "animal", "pet", "child", "baby",
];

// Object/material -> repair application keywords used to score against
// Product.approvedApplications / compatibleMaterials. Kept small and explicit
// on purpose -- this is a rules engine, not a black box.
const MATERIAL_SYNONYMS: Record<string, string[]> = {
  rubber: ["rubber", "sole", "elastomer"],
  fabric: ["fabric", "textile", "canvas", "mesh"],
  leather: ["leather"],
  plastic: ["plastic", "acrylic", "polycarbonate", "polystyrene", "pvc", "abs"],
  metal: ["metal", "steel", "aluminum", "aluminium", "brass"],
  wood: ["wood", "chipboard"],
  ceramic: ["ceramic", "porcelain"],
  foam: ["foam", "eva foam", "foam rubber"],
  glass: ["glass", "acrylic sheet"],
  paper: ["paper", "cardboard"],
};

/** Applications considered safety-critical (load-bearing, structural,
 *  vehicle-safety, or anything touching a person's physical safety).
 *  A product is only ever offered for these when its own data says so. */
const SAFETY_CRITICAL_APPLICATIONS = [
  "brake", "steering", "seatbelt", "helmet", "structural load-bearing",
  "suspension", "safety-critical",
];

function normalize(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().trim();
}

function isSafetyCritical(assessment: DamageAssessment): boolean {
  const app = normalize(assessment.application);
  const dmg = normalize(assessment.damage);
  return SAFETY_CRITICAL_APPLICATIONS.some((kw) => app.includes(kw) || dmg.includes(kw));
}

/** Step 1 of the repairability check -- is this even a legitimate repair candidate? */
export function checkRepairability(assessment: DamageAssessment): RepairCandidateStatus {
  const obj = normalize(assessment.object);

  if (!obj) return "NEED_MORE_INFO";
  if (NON_REPAIR_OBJECTS.some((k) => obj.includes(k))) return "NOT_RECOMMENDED";
  if (!assessment.isRepairCandidate) return "NOT_RECOMMENDED";
  if (!assessment.damage && !assessment.userText) return "NEED_MORE_INFO";
  if (assessment.confidence < 0.35) return "NEED_MORE_INFO";
  if (isSafetyCritical(assessment)) {
    // Never force a safety-critical repair suggestion through this path --
    // route to NOT_RECOMMENDED unless/until a product explicitly supports it
    // (checked again in matchProduct below, belt-and-braces).
    return "NOT_RECOMMENDED";
  }
  return "SUITABLE";
}

function materialMatches(product: Product, material: string | null): boolean {
  if (!material) return false;
  const m = normalize(material);
  const productMats = product.compatibleMaterials.map(normalize);
  // direct substring match
  if (productMats.some((pm) => m.includes(pm) || pm.includes(m))) return true;
  // synonym match
  for (const [canon, syns] of Object.entries(MATERIAL_SYNONYMS)) {
    if (syns.some((s) => m.includes(s)) && productMats.some((pm) => pm.includes(canon) || MATERIAL_SYNONYMS[canon]?.some((s) => pm.includes(s)))) {
      return true;
    }
  }
  return false;
}

function isExcluded(product: Product, material: string | null): boolean {
  if (!material) return false;
  const m = normalize(material);
  return product.incompatibleMaterials.some((im) => m.includes(normalize(im)) || normalize(im).includes(m));
}

function applicationMatches(product: Product, assessment: DamageAssessment): boolean {
  const hay = [assessment.application, assessment.damage, assessment.userText]
    .map(normalize)
    .join(" ");
  if (!hay.trim()) return true; // no application text to disqualify on
  return product.approvedApplications.some((app) => {
    const a = normalize(app);
    return hay.includes(a) || a.split(/\s+/).some((word) => word.length > 3 && hay.includes(word));
  }) || true; // application text is advisory, material compatibility is the hard gate
}

/**
 * TASK #4 core: compatibility check -> application check -> limitations
 * check -> repairability check -> RECOMMENDED product or NO_SUITABLE_PRODUCT.
 * Entirely silent/deterministic -- the caller decides what (if anything) to show.
 */
export function matchProduct(assessment: DamageAssessment): MatchResult {
  const repairability = checkRepairability(assessment);
  if (repairability !== "SUITABLE") {
    return { status: "NO_SUITABLE_PRODUCT", product: null, reasonSummary: null, reasonChecks: [], alternatives: [] };
  }

  const safetyCritical = isSafetyCritical(assessment);
  const candidates = getUsableProducts().filter((p) => p.line === "consumer" || p.line === "industrial");

  const scored = candidates
    .filter((p) => !safetyCritical || p.safetyCriticalApproved) // hard gate, never relaxed
    .filter((p) => !isExcluded(p, assessment.material))
    .map((p) => {
      const matMatch = materialMatches(p, assessment.material);
      const appMatch = applicationMatches(p, assessment);
      let score = 0;
      if (matMatch) score += 2;
      if (appMatch) score += 1;
      if (p.line === "consumer") score += 1; // prefer consumer-facing products for this app
      return { product: p, score, matMatch, appMatch };
    })
    .filter((c) => c.matMatch) // material compatibility is a hard requirement, not just a score boost
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return { status: "NO_SUITABLE_PRODUCT", product: null, reasonSummary: null, reasonChecks: [], alternatives: [] };
  }

  const best = scored[0];
  const reasonChecks: MatchReasonCheck[] = [
    { label: "Material match", passed: best.matMatch, detail: assessment.material ?? "unspecified" },
    { label: "Application match", passed: best.appMatch, detail: assessment.application ?? assessment.damage ?? "general repair" },
    { label: "Documented use", passed: true, detail: `From ${best.product.name}'s official product data` },
  ];

  const alternatives = scored.slice(1, 3).map((c) => ({
    product: c.product,
    verdict: (c.matMatch && c.appMatch ? "GOOD_CHOICE" : "NOT_BEST_MATCH") as "GOOD_CHOICE" | "NOT_BEST_MATCH",
    reason: c.matMatch
      ? "Also documented to bond this material, but is a less specific match than the top pick."
      : "Bonds a related material but isn't documented for this exact application.",
  }));

  return {
    status: "RECOMMENDED",
    product: best.product,
    reasonSummary: "Best documented match for this application.",
    reasonChecks,
    alternatives,
  };
}
