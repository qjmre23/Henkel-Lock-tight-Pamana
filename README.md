# LOCTITE PH — Repair Platform

An AI-guided repair platform for the Philippines that helps users determine if their broken items can be fixed using LOCTITE adhesives. This is a demo/prototype showcasing how Henkel's product knowledge can be combined with computer vision to provide localized repair guidance.

## 🎯 Overview

**"Something broke? Don't throw it yet. Let's see if it can be fixed."**

LOCTITE PH is a Next.js-based web application that enables users to:
1. Upload photos of damaged items (shoes, bags, cosplay props, electronics, etc.)
2. Receive AI-powered damage analysis using Google Gemini Vision
3. Get matched to the appropriate LOCTITE adhesive product
4. Find nearby retailers in the Philippines
5. Follow step-by-step repair guidance with real product cure times

The platform prioritizes accuracy and safety — it never invents products or claims, and enforces strict rules around safety-critical repairs.

## 🏗️ Project Structure

```
src/
├── app/
│   ├── api/
│   │   └── detect/route.ts          # Gemini Vision API endpoint
│   ├── globals.css                  # Tailwind design tokens
│   ├── layout.tsx                   # Root layout with metadata
│   └── page.tsx                     # Home page with hero & marquee
├── components/
│   ├── HeroCarousel.tsx             # Image carousel showcase
│   └── repair/
│       ├── RepairFlow.tsx           # Multi-screen repair wizard
│       └── StoreMap.tsx             # Mapbox integration for retailers
├── data/
│   ├── products.ts                  # LOCTITE product knowledge base
│   └── templates.ts                 # Repair templates (sneaker, cosplay, etc.)
├── lib/
│   ├── gemini.ts                    # Gemini API wrapper & JSON parsing
│   ├── image.ts                     # Client-side photo compression
│   ├── pricing.ts                   # Repair cost estimation
│   └── recommend.ts                 # Deterministic product matching rules
├── types/
│   └── index.ts                     # Shared TypeScript schema
├── proxy.ts                         # Next.js proxy (inert—see comments)
└── package.json
```

### Key Files

| File | Purpose |
|------|---------|
| `src/app/api/detect/route.ts` | Server-side Gemini Vision call—analyzes photos and returns structured damage assessment |
| `src/lib/recommend.ts` | Deterministic matching engine—never invents products, only recommends from official data |
| `src/types/index.ts` | Source of truth for data schema (Product, DamageAssessment, RepairTemplate, etc.) |
| `src/data/products.ts` | LOCTITE knowledge base—every field traces back to official documentation |
| `src/components/repair/RepairFlow.tsx` | Multi-step wizard UI (damage selection, product matching, store locator, guides) |
| `src/app/globals.css` | Design tokens from Modernist system—keep colors/spacing here |

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm or pnpm
- Google Gemini API key (with Vision capability)
- Mapbox API key (for store locator map)

### Installation

```bash
# Clone the repository
git clone https://github.com/qjmre23/Henkel-Lock-tight-Pamana.git
cd Henkel-Lock-tight-Pamana

# Install dependencies
npm install
# or
pnpm install
```

### Environment Setup

Create a `.env.local` file:

```bash
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token_here
GEMINI_API_KEY=your_gemini_api_key_here
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. The page auto-reloads as you edit files.

### Production Build

```bash
npm run build
npm run start
```

## 🎨 Technology Stack

- **Framework**: [Next.js 16](https://nextjs.org) with TypeScript
- **UI Styling**: [Tailwind CSS 4](https://tailwindcss.com)
- **Fonts**: [Archivo](https://fonts.google.com/specimen/Archivo) (Google Fonts)
- **Vision AI**: [Google Gemini Vision API](https://ai.google.dev/)
- **Maps**: [Mapbox GL](https://docs.mapbox.com/mapbox-gl-js/)
- **Hosting**: [Netlify](https://netlify.com) (with `@netlify/plugin-nextjs`)
- **Linting**: ESLint + eslint-config-next

## 📋 Features

### 1. **Photo Upload & AI Analysis**
- Client-side image compression (max 3.5MB, down-sampled JPEG)
- Server-side Gemini Vision analysis
- Returns structured `DamageAssessment` (object, material, damage type, confidence score)
- Defensive JSON parsing—handles model variations gracefully

### 2. **Repair Matching**
- Deterministic product recommendation engine (no black-box scoring)
- Material compatibility checking
- Application matching (what kind of fix is needed?)
- Safety-critical repair gate (only certain products approved for load-bearing repairs)

### 3. **Community/Template System**
Nine repair communities for filtering:
- **STUDENT** (school supplies, backpacks, electronics)
- **FASHION** (shoes, bags, clothing)
- **COSPLAY** (armor, props, EVA foam)
- **CREATOR** (equipment, tools)
- **TECH** (phone cases, cables)
- **ENGINEERING** (industrial adhesives)
- **CAMPUS** (dorm furniture, fixtures)
- **HOME** (furniture, fixtures)
- **MOTOR** (automotive, motorbikes)

### 4. **Repair Guidance**
Four-step guided process with real product data:
1. Confirm damage location & type
2. Review matched LOCTITE product with cure times
3. Learn application technique
4. Follow post-application care instructions

### 5. **Store Locator**
- Interactive Mapbox showing nearby LOCTITE retailers in the Philippines
- Placeholder data (currently demo coordinates + plausible retailer names)
- Ready for live retailer inventory integration

## 🔐 Design Principles

### Data Integrity
- **Every claim must cite a source.** Every Product field includes a `sourceUrl` and `sourceRetrievedAt`.
- **No AI-invented data.** The matching engine is deterministic—it only recommends products from the curated knowledge base.
- **Defensive parsing.** Gemini's output is validated and sanitized before use.

### User Safety
- **Safety-critical gate.** Repairs to brakes, structural load-bearing, seatbelts, helmets, etc. are only recommended if the product's official documentation explicitly approves it.
- **Clear limitations.** Every product shows its real cure times, temperature limits, incompatible materials, and warnings.
- **User warnings.** Disclaimers remind users to always follow the product pack's own instructions first.

### Accessibility & Localization
- **Taglish support.** Free-text description input accepts Filipino/English
- **Community-driven.** Templates are organized by use case, not product line
- **Clear imagery.** Hero carousel and per-template screenshots help users identify their item

## 🛠️ API Reference

### POST /api/detect

Analyzes a photo and optional free-text description using Gemini Vision.

**Request:**
```json
{
  "imageDataUrl": "data:image/jpeg;base64,...",
  "userText": "natanggal yung sole" // optional
}
```

**Response:**
```json
{
  "object": "Sneaker",
  "isRepairCandidate": true,
  "material": "Rubber + canvas",
  "damage": "Sole separation at the toe, upper peeling from the outsole",
  "damageType": "SOLE_SEPARATION",
  "application": "Reattach separated sole to upper",
  "confidence": 0.92,
  "damageRegion": { "x": 120, "y": 450, "width": 180, "height": 120 },
  "repairability": "SUITABLE"
}
```

**Error Handling:**
- `GeminiConfigError` — missing/invalid API key
- `GeminiRequestError` — malformed input or API failure
- JSON parsing fallback — if Gemini response is malformed, user is shown "NEED_MORE_INFO"

## 📦 Key Data Types

### `Product`
Represents a LOCTITE adhesive from the knowledge base.
```typescript
{
  id: "loctite-super-glue-gel",
  name: "LOCTITE Super Glue Gel — Ultra Gel Control",
  productId: "LOCTITE 401",
  family: "Super Glue",
  technology: "cyanoacrylate",
  compatibleMaterials: ["plastic", "rubber", "fabric"],
  incompatibleMaterials: ["silicone", "ptfe"],
  approvedApplications: ["leather repair", "plastic bond"],
  safetyCriticalApproved: false,
  fixtureTime: "3–10 sec",
  fullCureTime: "24 hr",
  sourceUrl: "https://...",
  sourceRetrievedAt: "2026-08-15"
}
```

### `DamageAssessment`
Output from Gemini Vision—what the AI saw.
```typescript
{
  object: "Sneaker",
  isRepairCandidate: true,
  material: "Rubber + canvas",
  damage: "Sole separation at the toe...",
  damageType: "SOLE_SEPARATION",
  application: "Reattach separated sole to upper",
  confidence: 0.92,
  damageRegion: { x, y, width, height } | null,
  repairability: "SUITABLE" | "NEED_MORE_INFO" | "NOT_RECOMMENDED"
}
```

### `RepairTemplate`
A pre-configured repair path (e.g., "Sneaker Rescue").
```typescript
{
  id: "sneaker",
  title: "Sneaker Rescue",
  material: "rubber",
  community: "STUDENT",
  commonDamages: ["SOLE_SEPARATION", "LOOSE_TRIM", ...],
  searchQuery: "sneakers",
  imageUrl: "...",
  fallbackReplacementRangePHP: [800, 2500]
}
```

## 🌐 Deployment

### Netlify (Recommended)

This project is built for Netlify edge functions and serverless functions.

```bash
# Deploy via Netlify CLI
npm install -g netlify-cli
netlify deploy

# Or connect your GitHub repo to Netlify and auto-deploy on push
```

**Environment variables to set in Netlify UI:**
- `NEXT_PUBLIC_MAPBOX_TOKEN`
- `GEMINI_API_KEY`

### Vercel

```bash
npm install -g vercel
vercel
```

## 📝 Development Notes

### Fixing Images
If you need to update the hero carousel or template images:
1. Keep images as public URLs (Wikimedia Commons, etc.)
2. Add `imageUrl` and `imageCredit` to the template/product data
3. Update the corresponding component prop

### Adding New Products
1. Edit `src/data/products.ts`
2. Add a new `Product` entry with:
   - Real compatibility data (from official docs)
   - At least one `sourceUrl` (must be verifiable)
   - Cure times and temperature limits
3. The matching engine will automatically consider it

### Adding New Templates
1. Edit `src/data/templates.ts`
2. Add a new `RepairTemplate` with community, material, common damages
3. Create an associated repair component if needed (usually RepairFlow covers it)

## 🐛 Known Limitations

1. **Placeholder Store Data**: Retailer inventory and real-time pricing are not yet live. All store info is demo data with placeholders labeled in the UI.
2. **Gemini Variability**: The vision model's JSON output can occasionally be malformed; the app has defensive parsing to handle this gracefully.
3. **Image Compression**: Very low-quality source images may not compress well; the app falls back to original if compression fails.
4. **Proxy Comment**: `src/proxy.ts` is intentionally inert—see the file comments for why it's kept (Next.js 16 middleware deployment quirk on Netlify).

## 📚 Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [Google Gemini API Docs](https://ai.google.dev/docs)
- [Mapbox GL JS Docs](https://docs.mapbox.com/mapbox-gl-js/)

## 🤝 Contributing

Contributions are welcome! Before submitting a PR, please:
1. Test locally with `npm run dev`
2. Run linting: `npm run lint`
3. Ensure no console errors or TypeScript issues
4. Document any new environment variables or dependencies

## 📄 License

This project is currently unlicensed. See the [LICENSE](./LICENSE) file for details, or contact the repository owner.

## 🎯 Roadmap

- [ ] Live retailer inventory integration
- [ ] Real-time pricing data for PH retailers
- [ ] User repair history & saved projects
- [ ] Community forum (sharing repairs, photos)
- [ ] Offline mode for repair guides
- [ ] Multi-language support (Tagalog, Cebuano, etc.)
- [ ] Accessibility audit & WCAG compliance
- [ ] Analytics & repair success tracking

---

**Built for the Philippines. Reduce waste, keep things working.**
