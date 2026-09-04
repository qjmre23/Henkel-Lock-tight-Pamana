// ============================================================================
// LOCTITE / HENKEL PRODUCT KNOWLEDGE BASE — TASK #3
//
// Every entry below is either:
//  (a) FULLY DOCUMENTED — technical claims pulled directly from an official
//      Henkel (next.henkel-adhesives.com/ph) or loctiteproducts.com page,
//      retrieved 2026-09-03. `sourceUrl` cites exactly where each entry's
//      claims came from.
//  (b) A CATALOG STUB — the product's existence + one-line description is
//      real (scraped from the live PH industrial-catalog category pages),
//      but its full technical data sheet was NOT retrieved in this pass.
//      Stubs intentionally carry EMPTY compatibleMaterials/applications
//      arrays so the recommendation engine (TASK #4) can never match them
//      to a repair -- they exist for catalog completeness only. Before
//      using a stub in a real recommendation, fetch its individual PDP
//      and fill in real data; never fabricate values here.
//
// PH retail pricing is intentionally NOT hardcoded here -- Shopee/Lazada
// listing pages are JS-rendered and prices change constantly. Live PH
// pricing for "Repair vs. Replace" / "Buy Online" comes from the Gemini web
// search backend at request time (TASK #10), not from this static file.
// ============================================================================

import type { Product } from "@/types";

const now = "2026-09-03";

export const PRODUCTS: Product[] = [
  // ─────────────────────────── CONSUMER LINE ───────────────────────────
  {
    id: "loctite-super-glue-liquid-professional",
    imageUrl: "https://m.media-amazon.com/images/I/51n8v7spbgL.jpg",
    name: "LOCTITE Super Glue Liquid Professional",
    productId: "SAP_0201DCL029X4",
    family: "Super Glue",
    line: "consumer",
    technology: "cyanoacrylate",
    compatibleMaterials: [
      "leather", "cork", "paper", "cardboard", "wood", "chipboard", "fabric",
      "metal", "ceramic", "rubber", "acrylic", "polycarbonate", "polystyrene", "PVC",
    ],
    incompatibleMaterials: [
      "polyethylene (PE)", "polypropylene (PP)", "PTFE", "silicone",
      "foam rubber", "polystyrene foam", "glass", "bone china",
    ],
    approvedApplications: [
      "quick household/office repairs", "rigid bonds", "general-purpose bonding",
    ],
    limitations: [
      "Rigid bond -- not flexible/impact-resistant (use Ultra Gel Control for that)",
      "Does not bond the listed incompatible materials",
    ],
    safetyCriticalApproved: false,
    fixtureTime: "15–30 sec",
    fullCureTime: null,
    maxTemperatureC: null,
    usageInfo:
      "Apply sparingly (~1 drop/sq in) to one surface only, press together immediately, hold 15–30 sec.",
    safetyInfo: "Safety Data Sheet available from Henkel/loctiteproducts.com.",
    retail: { sizeLabel: "0.70 oz / 20 g bottle", priceRangePHP: null, priceVerified: false, retailers: ["Watsons", "Ace Hardware", "Handyman", "Shopee (LOCTITE PH Official Store)", "Lazada"] },
    sourceUrl: "https://www.loctiteproducts.com/products/central-pdp.html/loctite-super-glue-liquid-professional/SAP_0201DCL029X4.html",
    sourceRetrievedAt: now,
  },
  {
    id: "loctite-super-glue-ultra-gel-control",
    imageUrl: "https://m.media-amazon.com/images/I/51Yl2fAQj1L.jpg",
    name: "LOCTITE Super Glue Ultra Gel Control",
    productId: "SAP_0201DGL029X9",
    family: "Super Glue",
    line: "consumer",
    technology: "cyanoacrylate",
    compatibleMaterials: [
      "leather", "cork", "paper", "cardboard", "wood", "chipboard", "fabric",
      "metal", "ceramic", "rubber", "acrylic", "polycarbonate", "polystyrene", "PVC",
    ],
    incompatibleMaterials: [
      "polyethylene (PE)", "polypropylene (PP)", "PTFE", "silicone", "foam rubber",
      "polystyrene foam", "glass", "very soft leathers", "bone china",
    ],
    approvedApplications: [
      "flexible/impact-resistant repairs", "vertical surfaces (no-drip gel)",
      "gap-filling repairs", "porous-material bonding",
    ],
    limitations: [
      "Not dishwasher, oven, or microwave safe",
      "Does not bond the listed incompatible materials",
    ],
    safetyCriticalApproved: false,
    fixtureTime: "15–30 sec",
    fullCureTime: "12–24 hr",
    maxTemperatureC: null,
    usageInfo: "Squeeze-controlled gel, no-drip. Press together immediately, hold 15–30 sec.",
    safetyInfo: "Safety Data Sheet available from Henkel/loctiteproducts.com.",
    retail: { sizeLabel: "0.14 oz / 4 g bottle", priceRangePHP: null, priceVerified: false, retailers: ["Watsons", "Ace Hardware", "Handyman", "Shopee (LOCTITE PH Official Store)", "Lazada"] },
    sourceUrl: "https://www.loctiteproducts.com/products/central-pdp.html/loctite-super-glue-ultra-gel-control/SAP_0201DGL029X9.html",
    sourceRetrievedAt: now,
  },
  {
    id: "loctite-power-grab-all-purpose",
    imageUrl: "https://m.media-amazon.com/images/I/51UHlTQ6WuL._AC_SY879_.jpg",
    name: "LOCTITE Power Grab All Purpose",
    productId: "SAP_0201C3L029J4",
    family: "Power Grab",
    line: "consumer",
    technology: "other",
    compatibleMaterials: [
      "wood", "drywall", "plaster", "ceramic", "concrete", "masonry", "brick",
      "foamboard", "cork", "vinyl cove base",
    ],
    incompatibleMaterials: ["mirrors", "stainless steel", "glass"],
    approvedApplications: [
      "interior construction/DIY bonding", "heavier gap-filling household repairs",
      "requires at least one porous surface",
    ],
    limitations: [
      "Interior use only",
      "Not suitable for underwater applications",
      "Requires at least one porous surface in the assembly",
    ],
    safetyCriticalApproved: false,
    fixtureTime: "repositionable up to 15 min",
    fullCureTime: "12 hr",
    maxTemperatureC: null,
    usageInfo:
      "Water-based, zero-second instant grab, dries white, paintable. Apply around perimeter ~2in from edge + beads every 6in.",
    safetyInfo: "Safety Data Sheet available from Henkel/loctiteproducts.com.",
    retail: { sizeLabel: "6 fl oz tube", priceRangePHP: null, priceVerified: false, retailers: ["Ace Hardware", "Handyman", "Shopee (LOCTITE PH Official Store)", "Lazada"] },
    sourceUrl: "https://www.loctiteproducts.com/products/central-pdp.html/loctite-power-grab-all-purpose/SAP_0201C3L029J4.html",
    sourceRetrievedAt: now,
  },
  {
    id: "loctite-epoxy-instant-mix-5min",
    imageUrl: "https://m.media-amazon.com/images/I/81dUpoOG+kL._SX342_.jpg",
    name: "LOCTITE Epoxy Instant Mix 5 Minute",
    productId: "SAP_0201OAL029U6",
    family: "Epoxy",
    line: "consumer",
    technology: "epoxy",
    compatibleMaterials: ["metal", "wood", "ceramic", "stone", "glass", "tile", "most plastics"],
    incompatibleMaterials: [],
    approvedApplications: [
      "rigid high-strength permanent repairs", "gap filling", "surface repairs",
      "laminating", "load-bearing household repairs where a rigid bond is acceptable",
    ],
    limitations: [
      "Rigid once cured -- not for joints needing flexibility",
      "Full cure time beyond the 1 hr handling strength was not documented in the source retrieved",
    ],
    safetyCriticalApproved: false,
    fixtureTime: "5 min (handling strength at 1 hr)",
    fullCureTime: null,
    maxTemperatureC: null,
    usageInfo: "Dual-syringe self-mixing nozzle dispenses resin + hardener 1:1. Can be sanded, drilled, painted once cured.",
    safetyInfo: "Safety Data Sheet available from Henkel/loctiteproducts.com.",
    retail: { sizeLabel: "0.47 fl oz syringe", priceRangePHP: null, priceVerified: false, retailers: ["Ace Hardware", "Handyman", "Shopee (LOCTITE PH Official Store)", "Lazada"] },
    sourceUrl: "https://www.loctiteproducts.com/products/central-pdp.html/loctite-epoxy-instant-mix-5min/SAP_0201OAL029U6.html",
    sourceRetrievedAt: now,
  },

  // ────────────────────── INDUSTRIAL — FULLY DOCUMENTED ──────────────────────
  {
    id: "loctite-401",
    imageUrl: "https://oaktreeproductscom-2.azureedge.net/img/product/40140_1-B.jpg?fv=A7BC52577C8D200EE17A1AAB66BFB763",
    name: "LOCTITE 401",
    productId: "BP000000153529",
    family: "Instant adhesives",
    line: "industrial",
    technology: "cyanoacrylate",
    compatibleMaterials: [
      "metals", "rubber", "wood", "cardboard", "ceramics", "most plastics",
      "porous materials (wood, paper, leather, fabric)",
      "PP/PE/PTFE (only with LOCTITE SF 770 primer)",
    ],
    incompatibleMaterials: [],
    approvedApplications: ["bonding close-fitting parts", "general industrial repairing/assembly"],
    limitations: [
      "Gap fill capacity max 0.15 mm",
      "Short fixture time limits repositioning",
      "Requires SF 770 primer for difficult-to-bond plastics (PP/PE/PTFE)",
    ],
    safetyCriticalApproved: false,
    fixtureTime: "5 sec (steel)",
    fullCureTime: null,
    maxTemperatureC: 120,
    usageInfo: "Viscosity 100 mPa·s. Shear strength on grit-blasted mild steel: 20 N/mm² (2900 psi).",
    safetyInfo: "Formulated with reduced hazardous ingredients per Henkel's occupational-safety documentation.",
    sourceUrl: "https://next.henkel-adhesives.com/ph/en/products/industrial-adhesives/central-pdp.html/loctite-401/BP000000153529.html",
    sourceRetrievedAt: now,
  },
  {
    id: "loctite-4902",
    imageUrl: "https://www.mcmaster.com/prerenderstable/mvPRE/Contents/gfx/ImageCache/747/74795a73p2-b05-digital@2x_637046103105924531.png",
    name: "LOCTITE 4902",
    productId: "Loctite4902",
    family: "Instant adhesives",
    line: "industrial",
    technology: "cyanoacrylate",
    compatibleMaterials: [
      "metals", "elastomers", "plastics",
      "PP/PE/PTFE (only with LOCTITE SF 7701 primer)",
    ],
    incompatibleMaterials: [],
    approvedApplications: [
      "flexible bondlines with leak resistance",
      "disposable medical device assembly (ISO 10993 biocompatible)",
    ],
    limitations: ["Requires SF 7701 primer for difficult-to-bond plastics"],
    safetyCriticalApproved: false,
    fixtureTime: "20 sec (steel)",
    fullCureTime: null,
    maxTemperatureC: 82,
    usageInfo: "Low-viscosity (200 mPa·s). Shear strength on mild steel: 10.5 N/mm² (1500 psi). Gap fill 0.12 mm.",
    safetyInfo: "ISO 10993 biocompatibility documented for disposable medical device use.",
    sourceUrl: "https://next.henkel-adhesives.com/ph/en/products/industrial-adhesives/central-pdp.html/loctite-4902/Loctite4902.html",
    sourceRetrievedAt: now,
  },
  {
    id: "loctite-243",
    imageUrl: "https://tameson.com/cdn/shop/files/243-005-loctite_00.e98f8934.jpg?v=1729914285",
    name: "LOCTITE 243",
    productId: "BP000000316211",
    family: "Threadlockers",
    line: "industrial",
    technology: "anaerobic",
    compatibleMaterials: ["steel", "stainless steel", "aluminum", "brass"],
    incompatibleMaterials: [],
    approvedApplications: [
      "threaded fastener locking against vibrational loosening",
      "corrosion/galling prevention between mating threads",
    ],
    limitations: [
      "Medium strength -- removable with hand tools (not a permanent structural bond)",
      "Not documented for non-threaded structural/safety-critical bonding",
    ],
    safetyCriticalApproved: false,
    fixtureTime: "10–30 min",
    fullCureTime: "24 hr (on active metals like steel)",
    maxTemperatureC: 150,
    usageInfo: "Blue, medium-strength, primerless. Fills 100% of thread gaps.",
    safetyInfo: "Technical/Safety Data Sheets available through Henkel documentation systems.",
    sourceUrl: "https://next.henkel-adhesives.com/ph/en/applications/threadlockers.html",
    sourceRetrievedAt: now,
  },

  // ───────────── INDUSTRIAL — CATALOG STUBS (name/description only; no
  // compatibility data, so these never surface in a recommendation until
  // their PDP is individually researched and this entry is upgraded) ─────────────
  ...([
    ["loctite-406", "LOCTITE 406", "Instant adhesives", "Low-viscosity for tight fitting parts", "https://next.henkel-adhesives.com/ph/en/products.html/producttype_2.3.5.4.1.5.html"],
    ["loctite-4204", "LOCTITE 4204", "Instant adhesives", "High temperature, high-viscosity adhesive", "https://next.henkel-adhesives.com/ph/en/products.html/producttype_2.3.5.4.1.5.html"],
    ["loctite-4307", "LOCTITE 4307", "Instant adhesives", "Dual-cure instant adhesive for exposed fillet or surface cure", "https://next.henkel-adhesives.com/ph/en/products.html/producttype_2.3.5.4.1.5.html"],
    ["loctite-480", "LOCTITE 480", "Instant adhesives", "Toughened, low-viscosity adhesive", "https://next.henkel-adhesives.com/ph/en/products.html/producttype_2.3.5.4.1.5.html"],
    ["loctite-495", "LOCTITE 495", "Instant adhesives", "General purpose instant adhesive", "https://next.henkel-adhesives.com/ph/en/products.html/producttype_2.3.5.4.1.5.html"],
    ["loctite-603", "LOCTITE 603", "Retaining compounds", "Powerful low-viscosity retaining compound for close-fitting cylindrical parts", "https://next.henkel-adhesives.com/ph/en/products.html/producttype_2.3.5.4.1.9.html"],
    ["loctite-609", "LOCTITE 609", "Retaining compounds", "General purpose, low-viscosity bonding of cylindrical parts", "https://next.henkel-adhesives.com/ph/en/products.html/producttype_2.3.5.4.1.9.html"],
    ["loctite-620", "LOCTITE 620", "Retaining compounds", "High-strength, high-temperature resistant bonding of cylindrical parts", "https://next.henkel-adhesives.com/ph/en/products.html/producttype_2.3.5.4.1.9.html"],
    ["loctite-638", "LOCTITE 638", "Retaining compounds", "High-strength, general purpose bonding of cylindrical parts", "https://next.henkel-adhesives.com/ph/en/products.html/producttype_2.3.5.4.1.9.html"],
    ["loctite-aa-326", "LOCTITE AA 326", "Structural adhesives", "General-purpose, high shear strength, metal-to-metal bonder", "https://next.henkel-adhesives.com/ph/en/products.html/producttype_2.3.5.4.1.11.html"],
    ["loctite-uk-5400", "LOCTITE UK 5400", "Structural adhesives", "Solvent-free pasty adhesive for production of sandwich elements", "https://next.henkel-adhesives.com/ph/en/products.html/producttype_2.3.5.4.1.11.html"],
    ["loctite-4304", "LOCTITE 4304", "Light curing adhesives", "General purpose, medical grade, flash cure, low-viscosity adhesive", "https://next.henkel-adhesives.com/ph/en/products.html/producttype_2.3.5.4.1.15.html"],
    ["loctite-aa-3103", "LOCTITE AA 3103", "Light curing adhesives", "Flexible bonds for stress-sensitive plastics", "https://next.henkel-adhesives.com/ph/en/products.html/producttype_2.3.5.4.1.15.html"],
    ["loctite-aa-3211", "LOCTITE AA 3211", "Light curing adhesives", "UV/Vis light-cure adhesive for stress-sensitive substrates", "https://next.henkel-adhesives.com/ph/en/products.html/producttype_2.3.5.4.1.15.html"],
    ["loctite-aa-3311", "LOCTITE AA 3311", "Light curing adhesives", "Low viscosity, medical-grade adhesive", "https://next.henkel-adhesives.com/ph/en/products.html/producttype_2.3.5.4.1.15.html"],
    ["loctite-aa-3321", "LOCTITE AA 3321", "Light curing adhesives", "Very high viscosity, medical-grade adhesive", "https://next.henkel-adhesives.com/ph/en/products.html/producttype_2.3.5.4.1.15.html"],
    ["teroson-pu-8590", "TEROSON PU 8590", "Windshield adhesives", "8-hour-SDAT windscreen bonder (Henkel's Teroson brand, not LOCTITE)", "https://next.henkel-adhesives.com/ph/en/products.html/producttype_2.3.5.4.1.17.html"],
  ] as const).map(([id, name, family, note, sourceUrl]) => ({
    id, name, productId: null, family, line: "industrial" as const, technology: "other" as const,
    compatibleMaterials: [], incompatibleMaterials: [], approvedApplications: [],
    limitations: [`CATALOG STUB: "${note}" is the only claim retrieved so far -- full technical data sheet not yet fetched. Do not use for compatibility matching until upgraded with real data.`],
    safetyCriticalApproved: false, fixtureTime: null, fullCureTime: null, maxTemperatureC: null,
    usageInfo: null, safetyInfo: null, sourceUrl, sourceRetrievedAt: now,
  })),
];

export function getProductById(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

/** Products with enough real, documented data to be used by the recommendation engine. */
export function getUsableProducts(): Product[] {
  return PRODUCTS.filter((p) => p.compatibleMaterials.length > 0 && p.approvedApplications.length > 0);
}
