// ============================================================================
// LOCTITE PH REPAIR PLATFORM — shared data schema
// Source of truth: BUILD PROMPT doc. Populated by TASK #2.
// ============================================================================

/** A community/vertical used for filtering templates and dashboard rollups. */
export type Community =
  | "STUDENT" | "FASHION" | "COSPLAY" | "CREATOR" | "TECH"
  | "ENGINEERING" | "CAMPUS" | "HOME" | "MOTOR";

export type CommunityFilter = "ALL" | Community;

/** Adhesive technology family, used for compatibility matching. */
export type AdhesiveTechnology =
  | "cyanoacrylate"
  | "epoxy"
  | "anaerobic"
  | "polyurethane"
  | "silicone"
  | "MS-polymer"
  | "other";

/** Where a product sits in Henkel's catalog. */
export type ProductLine = "consumer" | "industrial";

// ----------------------------------------------------------------------------
// Product — one row of the Henkel/LOCTITE knowledge base (TASK #3).
// Every field must trace back to an official source URL. Never invented.
// ----------------------------------------------------------------------------
export interface Product {
  /** Stable internal id, e.g. "loctite-super-glue-gel" */
  id: string;
  /** Official/marketing product name, e.g. "LOCTITE Super Glue Gel — Ultra Gel Control" */
  name: string;
  /** Manufacturer SKU / product ID if published (e.g. "LOCTITE 401"). Null if not documented. */
  productId: string | null;
  /** Product family grouping, e.g. "Super Glue", "Threadlocker", "Epoxy" */
  family: string;
  line: ProductLine;
  technology: AdhesiveTechnology;
  /** Materials the product is documented to bond. */
  compatibleMaterials: string[];
  /** Materials explicitly documented as NOT compatible / not recommended. */
  incompatibleMaterials: string[];
  /** Repair/use-case applications this product is documented for. */
  approvedApplications: string[];
  /** Explicit limitations, warnings, or restrictions from the source. */
  limitations: string[];
  /** True only if official docs explicitly support a safety-critical/structural use. */
  safetyCriticalApproved: boolean;
  fixtureTime: string | null; // e.g. "3–10 sec"
  fullCureTime: string | null; // e.g. "24 hr"
  maxTemperatureC: number | null;
  usageInfo: string | null;
  safetyInfo: string | null;
  /** Real product photo URL (no watermark), used in product/shop screens. Optional. */
  imageUrl?: string;
  /** PH retail info -- only populate with verified data, mark demo pricing separately. */
  retail?: {
    /** e.g. "4g tube" */
    sizeLabel: string | null;
    priceRangePHP: [number, number] | null;
    /** true if the price shown is a verified current PH retail price */
    priceVerified: boolean;
    retailers: string[]; // e.g. ["Watsons", "Ace Hardware", "Shopee (LOCTITE PH Official Store)"]
  };
  /** Every claim above must cite where it came from. */
  sourceUrl: string;
  sourceRetrievedAt: string; // ISO date the data was pulled/verified
}

// ----------------------------------------------------------------------------
// Damage assessment — output of Gemini vision + Taglish text understanding
// (TASK #7 / #8). Gemini only ever produces this shape; it never invents or
// selects a recommended product.
// ----------------------------------------------------------------------------
export type RepairCandidateStatus = "SUITABLE" | "NEED_MORE_INFO" | "NOT_RECOMMENDED";

export interface DamageRegion {
  /** Normalized 0..1 coordinates relative to the image. Rendered as an
   *  overlay entirely by application code (SVG/canvas) -- Gemini never draws. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DamageAssessment {
  id: string;
  sessionId: string;
  /** What Gemini thinks the object is, e.g. "Sneaker" */
  object: string;
  /** Whether the object is even a legitimate repair target. */
  isRepairCandidate: boolean;
  /** Best-guess material, e.g. "Rubber + fabric" */
  material: string | null;
  /** Best-guess damage description, e.g. "Sole separation" */
  damage: string | null;
  /** Normalized damage type bucket matching the UI chips. */
  damageType: "SOLE_SEPARATION" | "BROKEN_PART" | "LOOSE_TRIM" | "CRACK" | "OTHER" | null;
  /** Repair application inferred, used by the rules engine (TASK #4). */
  application: string | null;
  /** Gemini's confidence 0..1 for the overall detection. */
  confidence: number;
  /** Normalized bounding box for the damaged region. Null/absent if Gemini
   *  didn't return usable coordinates -- code must route to NEED_MORE_INFO,
   *  never guess a position. */
  damageRegion: DamageRegion | null;
  /** Free-text Taglish/English description the user typed, if any. */
  userText: string | null;
  /** Repairability check result (TASK #4's rules engine, not Gemini). */
  repairability: RepairCandidateStatus;
  /** True once the user has confirmed/corrected the detected damage region. */
  userConfirmed: boolean;
  createdAt: string;
}

// ----------------------------------------------------------------------------
// Match result — output of the deterministic recommendation engine (TASK #4).
// No AI-invented scores; every check below is computed from real Product data.
// ----------------------------------------------------------------------------
export interface MatchReasonCheck {
  label: string; // e.g. "Material match"
  passed: boolean;
  detail: string; // e.g. "rubber + fabric"
}

export interface MatchResult {
  status: "RECOMMENDED" | "NO_SUITABLE_PRODUCT";
  product: Product | null;
  /** One short human-readable reason, e.g. "Best documented match for this application." */
  reasonSummary: string | null;
  /** Opt-in "WHY?" detail -- computed from real rules, never AI-invented. */
  reasonChecks: MatchReasonCheck[];
  /** Other plausible products, for the optional "Choose the right LOCTITE" side path. */
  alternatives: Array<{ product: Product; verdict: "GOOD_CHOICE" | "NOT_BEST_MATCH"; reason: string }>;
}

// ----------------------------------------------------------------------------
// Repair vs. Replace — web-search-backed price comparison (TASK #10).
// Never fabricate a price/shop/image/source.
// ----------------------------------------------------------------------------
export interface PriceListing {
  shopName: string;
  price: number;
  currency: "PHP";
  sourceUrl: string;
  sourceDomain: string;
  listingTitle: string;
  imageUrl: string | null;
  matchConfidence: number; // 0..1
  retrievedAt: string;
}

export interface RepairVsReplace {
  /** AVAILABLE = real listings found via search. ESTIMATE_ONLY = no specific
   *  listing could be verified, so comparableReplacementPHP/priceRangePHP come
   *  from a broader search-grounded category estimate (estimateSource: "search")
   *  or, as a last resort when live search itself is unavailable, a static
   *  per-template market range (estimateSource: "fallback") -- see
   *  RepairTemplate.fallbackReplacementRangePHP. Either way this is clearly
   *  labeled to the user as an estimate, never presented as a verified listing. */
  status: "AVAILABLE" | "ESTIMATE_ONLY" | "NO_RELIABLE_PRICE_FOUND" | "PRICE_COMPARISON_UNAVAILABLE";
  itemName: string;
  /** Real LOCTITE pack price when known; otherwise a clearly-marked estimate. */
  repairCost: { amountPHP: number; isEstimate: boolean } | null;
  /** Actual product/pack price, distinct from the per-repair estimate above. */
  productPricePHP: number | null;
  comparableReplacementPHP: number | null;
  potentialSavingsPHP: number | null;
  listings: PriceListing[];
  priceRangePHP: [number, number] | null;
  searchTimestamp: string;
  /** Only set when status is ESTIMATE_ONLY -- one short sentence explaining
   *  where the range came from (a broader search, or the static fallback). */
  estimateNote: string | null;
  /** Only set when status is ESTIMATE_ONLY. "search" = Gemini still searched
   *  the web for a general category range. "fallback" = live search itself
   *  was unavailable/exhausted, so this is the template's static estimate. */
  estimateSource: "search" | "fallback" | null;
}

// ----------------------------------------------------------------------------
// Repair session — session-scoped state for one user's repair flow.
// ----------------------------------------------------------------------------
export type RepairScreen =
  | "home" | "gallery" | "expand" | "upload" | "scan" | "detect" | "correct"
  | "describe" | "check" | "product" | "guide" | "value" | "near" | "shop"
  | "share" | "quick";

export type IntentFraming = "careful" | "urgent" | "savings" | "neutral";

export interface RepairSession {
  id: string;
  startedAt: string;
  templateId: string | null;
  community: Community | null;
  imageUrl: string | null;
  assessment: DamageAssessment | null;
  match: MatchResult | null;
  repairVsReplace: RepairVsReplace | null;
  intent: IntentFraming;
  screen: RepairScreen;
  completed: boolean;
  completedAt: string | null;
}

// ----------------------------------------------------------------------------
// Nearby store (Mapbox "Find Nearest") -- demo/simulated unless verified.
// ----------------------------------------------------------------------------
export interface NearbyStore {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
  distanceKm: number | null;
  estimatedPricePHP: number | null;
  inventoryStatus: "IN_STOCK" | "LOW_STOCK" | "CHECK_STORE";
  openingHours: string;
  isSimulated: boolean;
}

// ----------------------------------------------------------------------------
// Template gallery item (home/gallery screens).
// ----------------------------------------------------------------------------
export type DamageType = "SOLE SEPARATION" | "BROKEN PART" | "LOOSE TRIM" | "CRACK" | "OTHER";

export interface RepairTemplate {
  id: string;
  title: string;
  community: Community;
  flagship: boolean; // true = full premium card, false = lower-fidelity mini card
  note: string;
  imagePlaceholder: string;
  /** Representative material for this template's repair, used to seed the deterministic
   *  rules engine when a user skips the photo/AI path (template-only flow). Chosen to be
   *  both realistic for the template's "loose detail / snapped piece" damage AND
   *  documented in src/data/products.ts, so template picks never dead-end. */
  material: string;
  /** Real stock photo for the card (no watermark). Optional -- falls back to imagePlaceholder text. */
  imageUrl?: string;
  /** Attribution for imageUrl, e.g. Wikimedia Commons credit. Shown in the gallery footer, not on the card itself. */
  imageCredit?: string;
  /** Damage options shown on this template's "WHAT HAPPENED?" picker -- a
   *  subset/ordering of DamageType chosen to be realistic for this item
   *  (e.g. only footwear offers SOLE SEPARATION). "OTHER" is always included
   *  as an escape hatch. */
  commonDamages: DamageType[];
  /** A plain, generic product-category search term (no internal template
   *  branding like "Rescue") used to query live PH pricing (TASK #10) when
   *  the user picks this template without uploading a photo -- keeps the
   *  Repair vs. Replace search from dead-ending on an oddly-worded query. */
  searchQuery: string;
  /** Last-resort "Repair vs. Replace" fallback: a rough [low, high] PHP
   *  market range for this category, used ONLY when live Gemini search
   *  (both the specific listing search and the broader category-estimate
   *  search) comes back with nothing usable. This is an author-supplied
   *  general estimate, not verified/live data -- the UI always labels it
   *  as such (RepairVsReplace.estimateSource === "fallback") and never
   *  presents it as a real listing. Exists so a template-only flow never
   *  dead-ends on a bare "price comparison unavailable" screen. */
  fallbackReplacementRangePHP: [number, number];
}

// ----------------------------------------------------------------------------
// Analytics events -- Kuya Lock dashboard (TASK #14). Real events from day one.
// ----------------------------------------------------------------------------
export type AnalyticsFunnel = "awareness" | "engagement" | "consideration" | "conversion" | "advocacy";

export type AnalyticsEventName =
  | "page_view"
  | "repair_started"
  | "repair_completed"
  | "template_selected"
  | "ai_diagnosis_run"
  | "product_recommended"
  | "why_this_loctite_tapped"
  | "product_viewed"
  | "find_nearest_clicked"
  | "buy_online_clicked"
  | "share_clicked"
  | "repeat_visit";

export interface AnalyticsEvent {
  id: string;
  name: AnalyticsEventName;
  funnel: AnalyticsFunnel;
  sessionId: string;
  templateId: string | null;
  community: Community | null;
  timestamp: string;
  meta: Record<string, string | number | boolean | null>;
}
