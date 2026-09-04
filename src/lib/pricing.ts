// ============================================================================
// Repair-cost ESTIMATE helper.
//
// We deliberately do NOT have verified current PH retail pricing per product
// (see src/data/products.ts header -- Shopee/Lazada prices are JS-rendered
// and change constantly). Per the spec: "Repair cost comes from real LOCTITE
// pricing when available, or is clearly marked 'estimate'... when it isn't."
// These numbers are rough, order-of-magnitude placeholders by product family
// ONLY -- always rendered with an "ESTIMATE" label, never presented as a
// verified price. Replace with real per-SKU PH pricing before shipping.
// ============================================================================

import type { Product } from "@/types";

const FAMILY_ESTIMATE_PHP: Record<string, number> = {
  "Super Glue": 150,
  "Power Grab": 220,
  Epoxy: 180,
  "Instant adhesives": 250,
  Threadlockers: 300,
};

export function getEstimatedRepairCostPHP(product: Product): number {
  return FAMILY_ESTIMATE_PHP[product.family] ?? 180;
}
