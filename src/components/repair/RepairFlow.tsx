"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { COMMUNITIES, TEMPLATES, getTemplateById } from "@/data/templates";
import { matchProduct, checkRepairability } from "@/lib/recommend";
import { getEstimatedRepairCostPHP } from "@/lib/pricing";
import StoreMap from "@/components/repair/StoreMap";
import type {
  CommunityFilter, DamageAssessment, DamageType, MatchResult, RepairScreen,
  RepairVsReplace,
} from "@/types";

type Screen = Exclude<RepairScreen, "home">;

const DAMAGES: DamageType[] = ["SOLE SEPARATION", "BROKEN PART", "LOOSE TRIM", "CRACK", "OTHER"];
const SAID_PHRASES = ["natanggal yung sole", "nabali yung plastic", "bumuka yung gilid", "napigtas yung strap"];

// Demo/simulated "Find Nearest" stores -- real Quezon City street names +
// plausible coordinates so the map centers/zooms sensibly, but pricing and
// stock are placeholders (labeled as such in the UI) until real retailer
// inventory data is connected. See task.md.
const NEAR_STORES = [
  { name: "Ace Hardware", km: "0.8 KM", addr: "Ground floor, mall complex, Quezon Ave.", stock: "IN STOCK", lat: 14.6410, lng: 121.0327 },
  { name: "Handyman", km: "1.4 KM", addr: "Level 2, retail center, Commonwealth Ave.", stock: "IN STOCK", lat: 14.6760, lng: 121.0851 },
  { name: "True Value", km: "2.1 KM", addr: "Hardware wing, Katipunan Ave.", stock: "LOW STOCK", lat: 14.6349, lng: 121.0730 },
] as const;

const GUIDE_STEPS = [
  { t: "Where the damage is", b: (dmg: string) => `${dmg}. We'll treat this as the repair area.`, bl: ["Clean, dry surface", "No structural break assumed", "Confirm before applying anything"] },
  { t: "Which LOCTITE to use", b: (name: string) => `${name} — the documented match for this material and application.`, bl: ["Check the product's real cure time below", "Use in a ventilated area", "Follow the pack's own instructions first"] },
  { t: "How to apply it", b: () => "Clean both surfaces, apply a thin line or as directed, press and hold.", bl: ["Clean and dry both faces", "Thin, even application", "Press and hold for the fixture time"] },
  { t: "What to do next", b: () => "Keep it undisturbed, then leave it to cure.", bl: ["Clamp or weight it if possible", "Wipe any squeeze-out immediately", "Let it reach full cure before use"] },
];

function pill(active: boolean) {
  return `all-unset cursor-pointer px-4 py-2.5 border-2 font-heading font-black text-[11px] tracking-[0.12em] transition-colors ${
    active ? "bg-accent border-accent text-white" : "border-text text-text hover:bg-neutral-200"
  }`;
}

function StatusBadge({ status }: { status: DamageAssessment["repairability"] }) {
  const map = {
    SUITABLE: { icon: "✓", label: "Suitable", bg: "#12855b" },
    NEED_MORE_INFO: { icon: "?", label: "Need more information", bg: "#b26a00" },
    NOT_RECOMMENDED: { icon: "✕", label: "Not recommended", bg: "#ec3013" },
  } as const;
  const s = map[status];
  return (
    <div className="w-16 h-16 flex-none border-[3px] border-white grid place-items-center font-heading font-black text-3xl" style={{ background: s.bg, color: "#fff" }}>
      {s.icon}
    </div>
  );
}

export default function RepairFlow({ initialScreen }: { initialScreen?: string }) {
  const [screen, setScreen] = useState<Screen>((initialScreen as Screen) || "gallery");
  const [filter, setFilter] = useState<CommunityFilter>("ALL");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [damageChoice, setDamageChoice] = useState<DamageType | null>(null);

  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [assessment, setAssessment] = useState<DamageAssessment | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const [match, setMatch] = useState<MatchResult | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const [guideStep, setGuideStep] = useState(1);

  const [rvr, setRvr] = useState<RepairVsReplace | null>(null);
  const [rvrLoading, setRvrLoading] = useState(false);
  const [rvrProgress, setRvrProgress] = useState(0);
  const rvrProgressTimer = useRef<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const [qty, setQty] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pickedPanelRef = useRef<HTMLDivElement>(null);

  const picked = pickedId ? getTemplateById(pickedId) : undefined;

  // Picking a template gallery card inserts the detail panel ABOVE the grid.
  // Without this, the panel can render off-screen (above the user's current
  // scroll position) and picking a card looks like it "did nothing".
  useEffect(() => {
    if (pickedId && pickedPanelRef.current) {
      pickedPanelRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [pickedId]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: TEMPLATES.length };
    for (const t of TEMPLATES) c[t.community] = (c[t.community] ?? 0) + 1;
    return c;
  }, []);
  const visible = useMemo(() => TEMPLATES.filter((t) => filter === "ALL" || t.community === filter), [filter]);
  const flagship = visible.filter((t) => t.flagship);
  const minis = visible.filter((t) => !t.flagship);

  const router = useRouter();
  function goHome() {
    router.push("/");
  }

  function startFromTemplate() {
    if (!picked || !damageChoice) return;
    const now = new Date().toISOString();
    const synthetic: DamageAssessment = {
      id: crypto.randomUUID(),
      sessionId: "local-session",
      object: picked.title,
      isRepairCandidate: true,
      material: picked.material,
      damage: damageChoice,
      damageType: damageChoice.replace(/ /g, "_") as DamageAssessment["damageType"],
      application: `${damageChoice} repair on ${picked.title.toLowerCase()}`,
      confidence: 1, // user-declared via template, not AI-guessed
      damageRegion: null,
      userText: null,
      repairability: "SUITABLE",
      userConfirmed: true,
      createdAt: now,
    };
    synthetic.repairability = checkRepairability(synthetic);
    setAssessment(synthetic);
    setScreen("check");
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(reader.result as string);
      setScreen("scan");
      runScan(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function runScan(dataUrl: string) {
    setScanning(true);
    setScanError(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch("/api/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: dataUrl, text: "" }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Detection failed (${res.status})`);
      }
      const data = await res.json();
      setAssessment(data.assessment as DamageAssessment);
      setScreen("detect");
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "AbortError"
          ? "Detection timed out after 25s. The AI service may be unreachable."
          : err instanceof Error
          ? err.message
          : "Couldn't reach the detection service.";
      setScanError(message);
      setScreen("detect");
    } finally {
      clearTimeout(timeout);
      setScanning(false);
    }
  }

  function confirmDescribeAndCheck() {
    if (!assessment) return;
    const updated: DamageAssessment = { ...assessment, userText: text || null, userConfirmed: true };
    updated.repairability = checkRepairability(updated);
    setAssessment(updated);
    setScreen("check");
  }

  function runProductMatch() {
    if (!assessment) return;
    setMatch(matchProduct(assessment));
    setScreen("product");
  }

  async function runValueSearch() {
    setScreen("value");
    if (!assessment) return;
    setRvrLoading(true);
    setRvrProgress(0);

    // Animate the loading ring toward ~92% while the real search is in flight
    // -- it never claims 100% until the fetch actually resolves, so the ring
    // stays honest (accurate) rather than just looking busy. ~4.5s to reach
    // 92% keeps it feeling deliberate rather than instant/fake.
    //
    // Date.now() below only ever runs inside this user-triggered event
    // handler (never during render), so it can't produce the render-time
    // instability react-hooks/purity guards against.
    // eslint-disable-next-line react-hooks/purity
    const startedAt = Date.now();
    const RAMP_MS = 4500;
    rvrProgressTimer.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setRvrProgress(Math.min(92, (elapsed / RAMP_MS) * 92));
    }, 60);

    // Template-only flows (no photo) skip Gemini's object detection, so
    // assessment.object is just the template's internal title (e.g. "Sneaker
    // Rescue") -- a poor search term. Prefer the template's plain-language
    // searchQuery there; the photo flow still uses Gemini's detected object.
    const itemName = (picked && !imageDataUrl ? picked.searchQuery : null) || assessment.object || picked?.searchQuery || picked?.title || "item";

    try {
      const res = await fetch("/api/repair-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemName, itemDescription: assessment.damage ?? undefined }),
      });
      const data = await res.json();
      const base: RepairVsReplace = data.repairVsReplace;
      if (base.status === "AVAILABLE" && match?.product) {
        base.repairCost = { amountPHP: getEstimatedRepairCostPHP(match.product), isEstimate: true };
        base.productPricePHP = null;
        base.potentialSavingsPHP = base.comparableReplacementPHP != null ? base.comparableReplacementPHP - base.repairCost.amountPHP : null;
      }
      setRvr(base);
    } catch {
      setRvr({
        status: "PRICE_COMPARISON_UNAVAILABLE", itemName: assessment.object || "item", repairCost: null,
        productPricePHP: null, comparableReplacementPHP: null, potentialSavingsPHP: null, listings: [],
        priceRangePHP: null, searchTimestamp: new Date().toISOString(),
      });
    } finally {
      if (rvrProgressTimer.current) {
        window.clearInterval(rvrProgressTimer.current);
        rvrProgressTimer.current = null;
      }
      setRvrProgress(100);
      // Brief pause so the ring is visibly seen reaching 100% before the
      // results replace it -- not too fast, matches how the real fetch felt.
      await new Promise((r) => setTimeout(r, 400));
      setRvrLoading(false);
    }
  }

  return (
    <div className="animate-rise min-h-screen">
      <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b-2 border-text sticky top-0 z-20 bg-bg">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-[26px] h-[26px] bg-accent" aria-hidden />
          <div className="font-heading font-black text-[13px] tracking-[0.14em] whitespace-nowrap">
            LOCTITE<span className="opacity-45"> / PH REPAIR</span>
          </div>
        </Link>
        {screen !== "gallery" && (
          <button onClick={goHome} className="font-heading font-extrabold text-[10px] tracking-[0.18em] text-neutral-600 hover:text-accent">
            &#8592; START OVER
          </button>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPickFile} />

      {/* ───────────────────────── GALLERY ───────────────────────── */}
      {screen === "gallery" && (
        <div>
          <div className="p-5 sm:p-10 pb-4">
            <h2 className="m-0 mb-1.5 font-heading font-black uppercase text-4xl sm:text-5xl tracking-[-0.02em]">Pick what broke</h2>
            <p className="m-0 text-sm text-neutral-700">{visible.length} templates in {filter === "ALL" ? "all communities" : filter.toLowerCase()}</p>
          </div>
          <div className="flex gap-2 overflow-x-auto px-5 sm:px-10 pb-4 border-b-2 border-text">
            {(["ALL", ...COMMUNITIES] as CommunityFilter[]).map((c) => (
              <button key={c} className={pill(c === filter)} onClick={() => setFilter(c)}>
                {c} &middot; {counts[c] ?? 0}
              </button>
            ))}
          </div>

          {picked && (
            <div ref={pickedPanelRef} className="border-b-2 border-text bg-neutral-200 scroll-mt-16">
              <div className="grid md:grid-cols-2">
                <div className="relative aspect-[4/3] bg-neutral-300 border-b-2 md:border-b-0 md:border-r-2 border-text flex items-center justify-center overflow-hidden">
                  {picked.imageUrl ? (
                    <img src={picked.imageUrl} alt={picked.title} className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs text-neutral-600 px-6 text-center">{picked.imagePlaceholder}</span>
                  )}
                  <div className="absolute top-0 left-0 bg-accent text-white px-3 py-2 font-heading font-black text-[10px] tracking-[0.16em]">{picked.community}</div>
                </div>
                <div className="p-6 sm:p-10 flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="m-0 font-heading font-black uppercase text-3xl sm:text-4xl tracking-[-0.02em]">{picked.title}</h3>
                    <button aria-label="Clear selection" className="w-8 h-8 flex-none grid place-items-center border-2 border-text font-heading font-black hover:bg-accent hover:border-accent hover:text-white" onClick={() => { setPickedId(null); setDamageChoice(null); }}>&#10005;</button>
                  </div>
                  <div className="border-t-2 border-text pt-4 font-heading font-black text-xs tracking-[0.18em]">WHAT HAPPENED?</div>
                  <div className="flex flex-wrap gap-2.5">
                    {(picked.commonDamages ?? DAMAGES).map((d) => (
                      <button key={d} className={pill(d === damageChoice)} onClick={() => setDamageChoice(d)}>{d}</button>
                    ))}
                  </div>
                  <button
                    disabled={!damageChoice}
                    onClick={startFromTemplate}
                    className="all-unset self-start bg-accent disabled:bg-neutral-400 disabled:cursor-not-allowed text-white px-6 py-4 font-heading font-black text-sm tracking-[0.12em]"
                  >
                    START REPAIR &#8594;
                  </button>
                  <div className="text-xs text-neutral-600">{damageChoice ? "We'll check if this is a documented repair next." : "Pick what happened to continue."}</div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {flagship.map((t) => (
              <button key={t.id} onClick={() => { setPickedId(t.id); setDamageChoice(null); }} className={`text-left border-r-2 border-b-2 ${picked?.id === t.id ? "border-accent bg-neutral-200" : "border-divider hover:bg-neutral-200"}`}>
                <div className="relative aspect-[4/3] bg-neutral-200 flex items-center justify-center overflow-hidden">
                  {t.imageUrl ? (
                    <img src={t.imageUrl} alt={t.title} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <span className="text-[11px] text-neutral-500 px-4 text-center">{t.imagePlaceholder}</span>
                  )}
                  <div className="absolute top-0 left-0 bg-text text-bg px-2.5 py-1.5 font-heading font-black text-[10px] tracking-[0.14em]">{t.community}</div>
                </div>
                <div className="p-4 flex flex-col gap-2">
                  <div className="font-heading font-black text-lg uppercase tracking-[-0.01em]">{t.title}</div>
                  <div className="text-[13px] text-neutral-700">{t.note}</div>
                  <div className="flex items-center gap-2 font-heading font-black text-[11px] tracking-[0.14em] text-accent-700">
                    {picked?.id === t.id ? "SELECTED" : "START"} <span>&#8594;</span>
                  </div>
                </div>
              </button>
            ))}
            {minis.map((m) => (
              <button key={m.id} onClick={() => { setPickedId(m.id); setDamageChoice(null); }} className={`text-left p-4 flex flex-col justify-between gap-4 min-h-[120px] border-r-2 border-b-2 ${picked?.id === m.id ? "border-accent bg-neutral-200" : "border-divider hover:bg-neutral-200"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="font-heading font-black text-[10px] tracking-[0.14em] opacity-45">{m.community}</div>
                  <div className="flex items-center gap-1 font-heading font-black text-[10px] tracking-[0.14em] text-accent-700">
                    {picked?.id === m.id ? "SELECTED" : "START"} <span>&#8594;</span>
                  </div>
                </div>
                <div className="font-heading font-extrabold text-[15px] uppercase">{m.title}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ───────────────────────── UPLOAD ───────────────────────── */}
      {screen === "upload" && (
        <div className="p-6 sm:p-14 flex flex-col gap-6">
          <h2 className="m-0 font-heading font-black uppercase text-4xl sm:text-5xl tracking-[-0.02em]">Show us the damage</h2>
          <div className="grid sm:grid-cols-2 gap-0.5 bg-text border-2 border-text">
            <button onClick={() => fileInputRef.current?.click()} className="bg-bg hover:bg-accent hover:text-white p-10 flex flex-col gap-4 min-h-[200px] justify-between">
              <span className="text-3xl">&#128247;</span>
              <span className="font-heading font-black text-lg tracking-[0.06em]">TAKE A PHOTO</span>
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="bg-bg hover:bg-accent hover:text-white p-10 flex flex-col gap-4 min-h-[200px] justify-between">
              <span className="text-3xl">&#128194;</span>
              <span className="font-heading font-black text-lg tracking-[0.06em]">UPLOAD PHOTO</span>
            </button>
          </div>
          <div className="flex items-center gap-2.5 text-sm text-neutral-700">
            <span className="w-2 h-2 bg-accent flex-none" />One photo is enough. We&apos;ll find the damage.
          </div>
        </div>
      )}

      {/* ───────────────────────── SCAN ───────────────────────── */}
      {screen === "scan" && (
        <div className="p-6 sm:p-14 flex flex-col gap-6">
          <div className="relative aspect-[4/3] bg-neutral-200 border-2 border-text overflow-hidden">
            {imageDataUrl && <img src={imageDataUrl} alt="Uploaded item" className="w-full h-full object-cover" />}
            <div className="absolute inset-0 bg-gradient-to-b from-accent/20 to-transparent pointer-events-none" />
            {scanning && <div className="absolute left-0 right-0 h-[3px] bg-accent shadow-[0_0_24px_#ec3013] animate-[lqSweep_1.1s_linear_infinite]" />}
          </div>
          <div className="flex flex-col gap-3">
            <div className="font-heading font-black text-2xl tracking-[0.1em]">{scanning ? "SCANNING…" : "DONE"}</div>
            <div className="h-2 bg-neutral-300"><div className="h-full bg-accent animate-[lqTick_1.8s_cubic-bezier(.3,.8,.2,1)_forwards]" /></div>
          </div>
        </div>
      )}

      {/* ───────────────────────── DETECT ───────────────────────── */}
      {screen === "detect" && (
        <div className="p-5 sm:p-10 flex flex-col gap-6">
          <div className="relative aspect-[4/3] bg-neutral-200 border-2 border-text">
            {imageDataUrl && <img src={imageDataUrl} alt="Uploaded item" className="w-full h-full object-cover" />}
            {assessment?.damageRegion && (
              <svg viewBox="0 0 100 75" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
                <ellipse
                  cx={assessment.damageRegion.x * 100 + (assessment.damageRegion.width * 100) / 2}
                  cy={assessment.damageRegion.y * 75 + (assessment.damageRegion.height * 75) / 2}
                  rx={Math.max((assessment.damageRegion.width * 100) / 2, 6)}
                  ry={Math.max((assessment.damageRegion.height * 75) / 2, 6)}
                  fill="none" stroke="#ec3013" strokeWidth={1.1} vectorEffect="non-scaling-stroke"
                  className="animate-[lqRing_2.4s_ease-in-out_infinite]"
                />
              </svg>
            )}
            <div className="absolute left-0 bottom-0 bg-text text-bg px-3.5 py-2.5 font-heading font-black text-[11px] tracking-[0.14em]">
              DETECTED: {(assessment?.object || "UNKNOWN").toUpperCase()}{assessment?.material ? ` · ${assessment.material.toUpperCase()}` : ""}
            </div>
          </div>
          {scanError && (
            <div className="border-2 border-accent p-4 text-sm text-accent-700">
              Couldn&apos;t reach the AI detection service ({scanError}). You can still describe the damage yourself below.
            </div>
          )}
          <div className="border-t-2 border-text pt-5 flex flex-col gap-4">
            <div className="font-heading font-black text-2xl sm:text-3xl uppercase tracking-[-0.01em]">
              {assessment?.damage || "Damage"} &mdash; did we get it right?
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => setScreen("describe")} className="bg-accent hover:bg-accent-600 text-white px-6 py-4 font-heading font-black text-sm tracking-[0.14em]">YES</button>
              <button onClick={() => setScreen("correct")} className="border-2 border-text hover:bg-text hover:text-bg px-6 py-4 font-heading font-black text-sm tracking-[0.14em]">NOT QUITE</button>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────── CORRECT ───────────────────────── */}
      {screen === "correct" && (
        <div className="p-6 sm:p-14 flex flex-col gap-6">
          <h2 className="m-0 font-heading font-black uppercase text-3xl sm:text-4xl tracking-[-0.02em]">Then what happened?</h2>
          <div className="flex flex-wrap gap-2.5">
            {DAMAGES.map((d) => (
              <button key={d} className={pill(d === assessment?.damage)} onClick={() => assessment && setAssessment({ ...assessment, damage: d, damageType: d.replace(/ /g, "_") as DamageAssessment["damageType"] })}>{d}</button>
            ))}
          </div>
          <button onClick={() => setScreen("describe")} className="all-unset self-start bg-accent text-white px-6 py-4 font-heading font-black text-sm tracking-[0.14em]">CONFIRM &#8594;</button>
        </div>
      )}

      {/* ───────────────────────── DESCRIBE ───────────────────────── */}
      {screen === "describe" && (
        <div className="p-6 sm:p-14 flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 bg-accent text-white grid place-items-center font-heading font-black flex-none">&#10003;</span>
            <span className="font-heading font-black text-xs tracking-[0.16em]">{(assessment?.damage || "DAMAGE").toUpperCase()} CONFIRMED</span>
          </div>
          <h2 className="m-0 font-heading font-black uppercase text-3xl sm:text-5xl tracking-[-0.02em]">What&apos;s wrong with it?</h2>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="natanggal yung sole" className="w-full border-2 border-text bg-transparent p-5 text-lg focus:outline-2 focus:outline-accent focus:outline-offset-2" />
          <div className="flex flex-wrap gap-2">
            {SAID_PHRASES.map((p) => (
              <button key={p} onClick={() => setText(p)} className="all-unset cursor-pointer border-2 border-neutral-400 px-3.5 py-2 rounded-full text-[13px] text-neutral-700 hover:border-accent hover:text-accent-700">&quot;{p}&quot;</button>
            ))}
          </div>
          <button onClick={confirmDescribeAndCheck} className="all-unset self-start bg-accent text-white px-7 py-5 font-heading font-black text-base tracking-[0.12em]">CHECK IF IT&apos;S FIXABLE &#8594;</button>
        </div>
      )}

      {/* ───────────────────────── CHECK ───────────────────────── */}
      {screen === "check" && assessment && (
        <div>
          <div className="px-5 sm:px-11 py-10 sm:py-16 text-white" style={{ background: assessment.repairability === "SUITABLE" ? "#12855b" : assessment.repairability === "NEED_MORE_INFO" ? "#b26a00" : "#ec3013" }}>
            <div className="flex items-center gap-4 flex-wrap">
              <StatusBadge status={assessment.repairability} />
              <div className="flex flex-col gap-2">
                <div className="font-heading font-black text-[11px] tracking-[0.2em] opacity-70">WORTH FIXING?</div>
                <div className="font-heading font-black uppercase text-4xl sm:text-6xl tracking-[-0.02em]">
                  {assessment.repairability === "SUITABLE" ? "Suitable" : assessment.repairability === "NEED_MORE_INFO" ? "Need more information" : "Not recommended"}
                </div>
              </div>
            </div>
            <div className="mt-5 text-lg max-w-[40ch]">
              {assessment.repairability === "SUITABLE" && `${assessment.object || "This item"} + ${(assessment.damage || "this damage").toLowerCase()} is a documented repair. Let's fix it.`}
              {assessment.repairability === "NEED_MORE_INFO" && "Try another photo, or tell us what's wrong."}
              {assessment.repairability === "NOT_RECOMMENDED" && "We couldn't find a suitable LOCTITE repair for this."}
            </div>
          </div>
          <div className="p-5 sm:p-10 flex flex-col gap-5">
            <div className="flex flex-wrap gap-3">
              <button
                disabled={assessment.repairability !== "SUITABLE"}
                onClick={runProductMatch}
                className="all-unset bg-accent disabled:bg-neutral-400 disabled:cursor-not-allowed text-white px-6 py-4 font-heading font-black text-sm tracking-[0.14em]"
              >
                {assessment.repairability === "SUITABLE" ? "FIX IT" : assessment.repairability === "NEED_MORE_INFO" ? "TRY AGAIN" : "DON'T FORCE IT"}
              </button>
              <button onClick={() => setScreen("upload")} className="border-2 border-text px-6 py-4 font-heading font-black text-sm tracking-[0.14em] hover:bg-text hover:text-bg">TRY ANOTHER PHOTO</button>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────── PRODUCT ───────────────────────── */}
      {screen === "product" && (
        <div className="grid md:grid-cols-2">
          <div className="relative aspect-square bg-neutral-200 border-b-2 md:border-b-0 md:border-r-2 border-text flex items-center justify-center overflow-hidden">
            {match?.product?.imageUrl ? (
              <img src={match.product.imageUrl} alt={match.product.name} className="absolute inset-0 w-full h-full object-contain bg-white" />
            ) : (
              <span className="text-xs text-neutral-500 px-6 text-center">{match?.product ? match.product.name : "No product photo"}</span>
            )}
            {match?.product && <div className="absolute left-0 bottom-0 bg-accent text-white px-3.5 py-2.5 font-heading font-black text-[11px] tracking-[0.16em]">USE THIS</div>}
          </div>
          <div className="p-6 sm:p-11 flex flex-col gap-5">
            {match?.status === "RECOMMENDED" && match.product ? (
              <>
                <div className="font-heading font-extrabold text-[11px] tracking-[0.18em] text-neutral-600">YOUR ITEM: {(assessment?.object || picked?.title || "").toUpperCase()} &middot; {assessment?.damage}</div>
                <h2 className="m-0 font-heading font-black uppercase text-3xl sm:text-5xl tracking-[-0.02em]">{match.product.name}</h2>
                <div className="text-lg text-neutral-700">{match.reasonSummary}</div>
                <button onClick={() => setWhyOpen((v) => !v)} className="all-unset self-start border-2 border-text px-5 py-3 font-heading font-black text-xs tracking-[0.16em] hover:bg-text hover:text-bg">{whyOpen ? "HIDE" : "WHY?"}</button>
                {whyOpen && (
                  <div className="flex flex-col gap-2.5 border-l-4 border-accent pl-4">
                    {match.reasonChecks.map((c) => (
                      <div key={c.label} className="text-[15px] font-bold">{c.passed ? "✓" : "–"} {c.label} &mdash; {c.detail}</div>
                    ))}
                  </div>
                )}
                <div className="border-2 border-divider p-4 flex flex-col gap-3">
                  <div className="flex justify-between gap-3 font-heading font-black text-base tracking-[0.1em]"><span className="text-neutral-600">FIXTURE TIME</span><span>{match.product.fixtureTime ?? "not documented"}</span></div>
                  <div className="h-0.5 bg-divider" />
                  <div className="flex justify-between gap-3 font-heading font-black text-base tracking-[0.1em]"><span className="text-neutral-600">FULL CURE</span><span>{match.product.fullCureTime ?? "not documented"}</span></div>
                  <div className="text-sm text-neutral-600">From {match.product.name}&apos;s official product data ({match.product.sourceUrl.replace(/^https?:\/\//, "").split("/")[0]}).</div>
                </div>
                <button onClick={() => setScreen("guide")} className="all-unset self-start bg-accent text-white px-7 py-5 font-heading font-black text-base tracking-[0.12em]">SHOW ME HOW &#8594;</button>
              </>
            ) : (
              <>
                <h2 className="m-0 font-heading font-black uppercase text-3xl sm:text-4xl tracking-[-0.02em]">No suitable product</h2>
                <p className="text-neutral-700">Nothing in the current knowledge base is documented for this exact material + application. We&apos;d rather say that than guess.</p>
                <Link href="/repair" className="all-unset self-start border-2 border-text px-6 py-4 font-heading font-black text-sm tracking-[0.14em] hover:bg-text hover:text-bg">BACK TO TEMPLATES</Link>
              </>
            )}
          </div>
        </div>
      )}

      {/* ───────────────────────── GUIDE ───────────────────────── */}
      {screen === "guide" && match?.product && (
        <div>
          <div className="flex gap-0.5 bg-text border-b-2 border-text overflow-x-auto">
            {GUIDE_STEPS.map((s, i) => (
              <button key={s.t} onClick={() => setGuideStep(i + 1)} className={`flex-1 whitespace-nowrap px-4 py-3.5 font-heading font-black text-[10px] tracking-[0.14em] uppercase ${guideStep === i + 1 ? "bg-accent text-white" : "bg-bg text-text"}`}>
                <span className="opacity-55">0{i + 1}</span> {s.t}
              </button>
            ))}
          </div>
          <div className="grid md:grid-cols-2">
            <div className="relative aspect-[4/3] bg-neutral-200 border-b-2 md:border-b-0 md:border-r-2 border-text flex items-center justify-center overflow-hidden">
              {guideStep === 1 && (imageDataUrl || picked?.imageUrl) ? (
                <>
                  <img src={imageDataUrl || picked!.imageUrl} alt="The damaged area" className="absolute inset-0 w-full h-full object-cover" />
                  {assessment?.damageRegion && (
                    <svg viewBox="0 0 100 75" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
                      <ellipse
                        cx={assessment.damageRegion.x * 100 + (assessment.damageRegion.width * 100) / 2}
                        cy={assessment.damageRegion.y * 75 + (assessment.damageRegion.height * 75) / 2}
                        rx={Math.max((assessment.damageRegion.width * 100) / 2, 6)}
                        ry={Math.max((assessment.damageRegion.height * 75) / 2, 6)}
                        fill="none" stroke="#ec3013" strokeWidth={1.1} vectorEffect="non-scaling-stroke"
                        className="animate-[lqRing_2.4s_ease-in-out_infinite]"
                      />
                    </svg>
                  )}
                </>
              ) : (guideStep === 2 || guideStep === 3) ? (
                match.product.imageUrl ? (
                  <img src={match.product.imageUrl} alt={match.product.name} className="absolute inset-0 w-full h-full object-contain bg-white" />
                ) : (
                  <span className="text-xs text-neutral-500 px-6 text-center">{match.product.name}</span>
                )
              ) : guideStep === 4 ? (
                <div className="absolute inset-0 bg-white flex items-center justify-center p-10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://1000logos.net/wp-content/uploads/2020/08/Loctite-Logo.jpg"
                    alt="LOCTITE"
                    className="max-w-[65%] max-h-[65%] object-contain"
                    style={{ mixBlendMode: "multiply" }}
                  />
                </div>
              ) : (
                <span className="text-xs text-neutral-500 px-6 text-center">Step {guideStep} illustration</span>
              )}
              <div className="absolute top-0 left-0 bg-text text-bg px-3.5 py-2.5 font-heading font-black text-[10px] tracking-[0.16em]">STEP {guideStep} / 4</div>
            </div>
            <div className="p-6 sm:p-11 flex flex-col gap-5">
              <h2 className="m-0 font-heading font-black uppercase text-3xl sm:text-4xl tracking-[-0.02em]">{GUIDE_STEPS[guideStep - 1].t}</h2>
              <div className="text-lg text-neutral-700 max-w-[34ch]">
                {guideStep === 1 && GUIDE_STEPS[0].b(assessment?.damage || "The damaged area")}
                {guideStep === 2 && GUIDE_STEPS[1].b(match.product.name)}
                {guideStep === 3 && GUIDE_STEPS[2].b("")}
                {guideStep === 4 && GUIDE_STEPS[3].b("")}
              </div>
              <div className="flex flex-col gap-0.5 bg-divider">
                {GUIDE_STEPS[guideStep - 1].bl.map((b) => (
                  <div key={b} className="bg-bg py-3.5 flex items-center gap-3 font-heading font-extrabold text-[13px]"><span className="w-2 h-2 bg-accent flex-none" />{b}</div>
                ))}
              </div>
              <button
                onClick={() => (guideStep === 4 ? runValueSearch() : setGuideStep(guideStep + 1))}
                className={`all-unset self-start text-white px-6 py-4 font-heading font-black text-sm tracking-[0.14em] ${guideStep === 4 ? "bg-accent" : "bg-text"}`}
              >
                {guideStep === 4 ? "SEE WHAT REPLACING COSTS →" : "NEXT STEP →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────── VALUE ───────────────────────── */}
      {screen === "value" && (
        <div>
          <div className="p-5 sm:p-11 pb-0 font-heading font-black uppercase text-2xl sm:text-4xl tracking-[-0.01em] max-w-[24ch]">Don&apos;t throw it yet. It may be cheaper to repair.</div>
          {rvrLoading ? (
            <div className="p-10 sm:p-16 flex flex-col items-center justify-center gap-5 min-h-[320px]">
              <svg width="128" height="128" viewBox="0 0 128 128" className="-rotate-90" aria-hidden>
                <circle cx="64" cy="64" r="56" fill="none" stroke="#e5e5e5" strokeWidth="10" />
                <circle
                  cx="64" cy="64" r="56" fill="none" stroke="#ec3013" strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 56}
                  strokeDashoffset={2 * Math.PI * 56 * (1 - rvrProgress / 100)}
                  style={{ transition: "stroke-dashoffset 0.12s linear" }}
                />
              </svg>
              <div className="font-heading font-black text-3xl tabular-nums">{Math.round(rvrProgress)}%</div>
              <div className="text-neutral-600 text-sm">Searching for comparable prices&#8230;</div>
            </div>
          ) : rvr?.status === "AVAILABLE" ? (
            <>
              <div className="grid sm:grid-cols-2 mt-6 border-y-2 border-text">
                <div className="border-r-0 sm:border-r-2 border-text">
                  <div className="relative aspect-square bg-neutral-200 overflow-hidden">
                    {(imageDataUrl || picked?.imageUrl) ? (
                      <img src={imageDataUrl || picked!.imageUrl} alt={assessment?.object || picked?.title || "Your item"} className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-xs text-neutral-500 px-4 text-center">No photo</div>
                    )}
                    <div className="absolute top-0 left-0 bg-text text-bg px-3 py-2 font-heading font-black text-[10px] tracking-[0.16em]">YOUR ITEM</div>
                  </div>
                  <div className="p-4 border-t-2 border-text">
                    <div className="font-heading font-extrabold text-[10px] tracking-[0.16em] text-neutral-600">NAME:</div>
                    <div className="font-heading font-black text-base uppercase">{assessment?.object || picked?.title || "—"}</div>
                  </div>
                </div>
                <div>
                  <div className="relative aspect-square bg-neutral-200 overflow-hidden">
                    {rvr.listings[0]?.imageUrl ? (
                      <img src={rvr.listings[0].imageUrl} alt={rvr.listings[0].listingTitle} className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-xs text-neutral-500 px-4 text-center">No photo found online</div>
                    )}
                    <div className="absolute top-0 left-0 bg-accent text-white px-3 py-2 font-heading font-black text-[10px] tracking-[0.16em]">FOUND ONLINE</div>
                  </div>
                  <div className="p-4 border-t-2 border-text sm:border-l-0">
                    <div className="font-heading font-extrabold text-[10px] tracking-[0.16em] text-neutral-600">NAME:</div>
                    <div className="font-heading font-black text-base uppercase">{rvr.listings[0]?.listingTitle ?? "No comparable listing found"}</div>
                  </div>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 border-b-2 border-text">
                <div className="p-6 sm:p-10 border-r-0 sm:border-r-2 border-text">
                  <div className="font-heading font-black text-xs tracking-[0.2em] text-neutral-600">REPAIR</div>
                  <div className="font-heading font-black text-5xl sm:text-7xl tracking-[-0.04em] mt-3">&#8369;{rvr.repairCost?.amountPHP ?? "–"}</div>
                  <div className="font-heading font-extrabold text-[11px] tracking-[0.14em] text-neutral-600 mt-2.5">{rvr.repairCost?.isEstimate ? "ESTIMATE" : "PRODUCT PRICE"}</div>
                </div>
                <div className="p-6 sm:p-10 bg-neutral-200">
                  <div className="font-heading font-black text-xs tracking-[0.2em] text-neutral-600">REPLACE</div>
                  <div className="font-heading font-black text-5xl sm:text-7xl tracking-[-0.04em] mt-3 text-accent">&#8369;{rvr.comparableReplacementPHP}</div>
                  <div className="font-heading font-extrabold text-[11px] tracking-[0.14em] text-neutral-600 mt-2.5">COMPARABLE ITEM</div>
                </div>
              </div>
              {rvr.potentialSavingsPHP != null && rvr.potentialSavingsPHP > 0 && (
                <div className="bg-accent text-white p-6 sm:p-10 flex flex-wrap items-baseline gap-3.5">
                  <span className="font-heading font-black text-lg tracking-[0.16em]">YOU COULD SAVE</span>
                  <span className="font-heading font-black text-5xl sm:text-7xl tracking-[-0.03em]">&#8369;{rvr.potentialSavingsPHP}</span>
                </div>
              )}
              <div className="p-5 sm:p-10 flex flex-col gap-4">
                <div className="flex flex-wrap gap-3">
                  <button onClick={() => setDetailsOpen((v) => !v)} className="all-unset border-2 border-text px-5 py-3.5 font-heading font-black text-[11px] tracking-[0.16em] hover:bg-text hover:text-bg">{detailsOpen ? "HIDE THE DETAIL" : "HOW WE GOT THESE NUMBERS"}</button>
                </div>
                {detailsOpen && (
                  <div className="border-2 border-divider p-4 flex flex-col gap-3">
                    <div className="font-heading font-black text-[10px] tracking-[0.18em] text-neutral-600">LISTINGS FOUND &middot; LIVE SEARCH</div>
                    {rvr.listings.map((l) => (
                      <a key={l.sourceUrl} href={l.sourceUrl} target="_blank" rel="noopener noreferrer" className="flex justify-between gap-3 border-t-2 border-divider pt-2.5 text-[13px] font-bold hover:text-accent">
                        <span>{l.shopName} ({l.sourceDomain})</span><span>&#8369;{l.price}</span>
                      </a>
                    ))}
                    {rvr.priceRangePHP && <div className="font-heading font-black text-[11px] tracking-[0.14em]">ESTIMATED MARKET RANGE: &#8369;{rvr.priceRangePHP[0]}&#8211;&#8369;{rvr.priceRangePHP[1]}</div>}
                    <div className="text-xs text-neutral-700">Repair figure is a per-repair estimate, not a verified pack price — see task.md.</div>
                  </div>
                )}
                <div className="flex flex-wrap gap-3">
                  <button onClick={() => setScreen("near")} className="all-unset bg-accent text-white px-6 py-4 font-heading font-black text-sm tracking-[0.14em]">FIND IT NEAR ME</button>
                  <button onClick={() => setScreen("shop")} className="all-unset border-2 border-text px-6 py-4 font-heading font-black text-sm tracking-[0.14em] hover:bg-text hover:text-bg">BUY ONLINE</button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-6 sm:p-10 flex flex-col gap-5">
              <div className="border-2 border-dashed border-neutral-500 p-6 font-heading font-black uppercase text-xl">
                {rvr?.status === "NO_RELIABLE_PRICE_FOUND" ? "NO RELIABLE PRICE FOUND" : "PRICE COMPARISON UNAVAILABLE"}
              </div>
              <p className="text-neutral-700">We couldn&apos;t find a trustworthy comparable price right now — we&apos;d rather say that than make one up.</p>
              <div className="flex flex-wrap gap-3">
                <button onClick={() => setScreen("near")} className="all-unset bg-accent text-white px-6 py-4 font-heading font-black text-sm tracking-[0.14em]">FIND IT NEAR ME</button>
                <button onClick={() => setScreen("shop")} className="all-unset border-2 border-text px-6 py-4 font-heading font-black text-sm tracking-[0.14em] hover:bg-text hover:text-bg">BUY ONLINE</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────── NEAR ───────────────────────── */}
      {screen === "near" && (
        <div className="grid md:grid-cols-2">
          <div className="relative min-h-[300px] border-b-2 md:border-b-0 md:border-r-2 border-text bg-neutral-300">
            <StoreMap
              stores={NEAR_STORES.map((s) => ({ id: s.name, name: s.name, lat: s.lat, lng: s.lng, stock: s.stock as "IN STOCK" | "LOW STOCK" }))}
            />
            <div className="absolute left-0 top-0 bg-text text-bg px-3.5 py-2.5 font-heading font-black text-[10px] tracking-[0.16em] z-10">MAP &middot; DEMO / SIMULATED STORE DATA</div>
          </div>
          <div>
            <div className="px-6 sm:px-9 py-6 border-b-2 border-text"><h2 className="m-0 font-heading font-black uppercase text-3xl sm:text-4xl tracking-[-0.02em]">Near you</h2></div>
            {NEAR_STORES.map((s) => (
              <div key={s.name} className="border-b-2 border-divider px-6 sm:px-9 py-4.5 flex flex-col gap-2.5">
                <div className="flex justify-between gap-3"><span className="font-heading font-black text-[15px] uppercase">{s.name}</span><span className="font-heading font-black text-xs text-accent">{s.km}</span></div>
                <div className="text-[13px] text-neutral-700">{s.addr}</div>
                <div className="flex flex-wrap gap-2 font-heading font-black text-[10px] tracking-[0.12em]">
                  <span className="border-2 border-divider px-2.5 py-1.5">SIMULATED PRICE</span>
                  <span className="border-2 px-2.5 py-1.5" style={{ borderColor: s.stock === "IN STOCK" ? "#12855b" : "#b26a00", color: s.stock === "IN STOCK" ? "#12855b" : "#b26a00" }}>{s.stock}</span>
                </div>
                <div className="flex gap-2 mt-1"><button onClick={() => setScreen("shop")} className="all-unset border-2 border-text px-4 py-3 font-heading font-black text-[10px] tracking-[0.14em] hover:bg-text hover:text-bg">BUY ONLINE</button></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ───────────────────────── SHOP ───────────────────────── */}
      {screen === "shop" && (
        <div className="grid md:grid-cols-2">
          <div className="relative aspect-square bg-neutral-200 border-b-2 md:border-b-0 md:border-r-2 border-text flex items-center justify-center overflow-hidden">
            {match?.product?.imageUrl ? (
              <img src={match.product.imageUrl} alt={match.product.name} className="absolute inset-0 w-full h-full object-contain bg-white" />
            ) : (
              <span className="text-xs text-neutral-500 px-6 text-center">{match?.product?.name ?? "Product photo"}</span>
            )}
            <div className="absolute top-0 left-0 bg-text text-bg px-3.5 py-2.5 font-heading font-black text-[10px] tracking-[0.16em]">PROTOTYPE / DEMO LISTING</div>
          </div>
          <div className="p-6 sm:p-10 flex flex-col gap-4">
            <div className="font-heading font-black text-xs tracking-[0.2em] text-accent">LOCTITE</div>
            <h2 className="m-0 font-heading font-black uppercase text-3xl sm:text-4xl tracking-[-0.02em]">{match?.product?.name ?? "Product"}</h2>
            <div className="font-heading font-extrabold text-[11px] tracking-[0.14em] text-neutral-600">ID: {match?.product?.productId ?? "N/A"} &middot; {match?.product?.retail?.sizeLabel ?? "size not documented"}</div>
            <div className="font-heading font-black text-4xl sm:text-5xl tracking-[-0.03em]">&#8369;{match?.product ? getEstimatedRepairCostPHP(match.product) : "–"} <span className="text-xs font-body font-normal text-neutral-600 align-middle">est.</span></div>
            <div className="flex items-center gap-3.5 border-t-2 border-divider pt-4">
              <span className="font-heading font-extrabold text-[10px] tracking-[0.16em] text-neutral-600">QTY</span>
              <div className="flex border-2 border-text">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="all-unset px-4 py-2.5 font-heading font-black hover:bg-text hover:text-bg">&#8722;</button>
                <div className="px-4.5 py-2.5 font-heading font-black border-x-2 border-text min-w-[24px] text-center">{qty}</div>
                <button onClick={() => setQty((q) => q + 1)} className="all-unset px-4 py-2.5 font-heading font-black hover:bg-text hover:text-bg">+</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="all-unset border-2 border-text px-6 py-4 font-heading font-black text-xs tracking-[0.14em] hover:bg-text hover:text-bg">ADD TO CART</button>
              <button onClick={() => setScreen("share")} className="all-unset bg-accent text-white px-6 py-4 font-heading font-black text-xs tracking-[0.14em] hover:bg-accent-600">BUY NOW</button>
            </div>
            <div className="text-xs text-neutral-600">Prototype listing. Price, seller and stock are placeholders until real retailer data is connected.</div>
          </div>
        </div>
      )}

      {/* ───────────────────────── SHARE ───────────────────────── */}
      {screen === "share" && (
        <div className="p-6 sm:p-11 flex flex-col items-center gap-6">
          <div className="w-full max-w-[330px] aspect-[9/16] bg-accent text-white flex flex-col border-2 border-text">
            <div className="p-5 flex flex-col gap-1.5">
              <div className="font-heading font-black text-[10px] tracking-[0.24em] opacity-80">LOCTITE PH</div>
              <div className="font-heading font-black text-[28px] leading-[.92] uppercase tracking-[-0.02em]">I fixed it with LOCTITE &#128295;</div>
            </div>
            <div className="flex-1 relative bg-neutral-800 mx-5">
              {imageDataUrl && <img src={imageDataUrl} alt="Repaired item" className="w-full h-full object-cover" />}
            </div>
            <div className="p-5 flex flex-col gap-2">
              <div className="font-heading font-black text-lg tracking-[0.04em] uppercase">{assessment?.object || picked?.title} &mdash; {(assessment?.damage || "repair").toLowerCase()}</div>
              {rvr?.potentialSavingsPHP != null && <div className="font-heading font-extrabold text-[10px] tracking-[0.2em] opacity-85">SAVED &#8369;{rvr.potentialSavingsPHP} &middot; DEMO</div>}
              {match?.product && (
                <div className="flex items-center gap-2.5 mt-1 border-t border-white/25 pt-2.5">
                  {match.product.imageUrl ? (
                    <img src={match.product.imageUrl} alt={match.product.name} className="w-8 h-8 flex-none object-contain bg-white border border-white/40" />
                  ) : (
                    <span className="w-8 h-8 flex-none bg-white/15 border border-white/40" aria-hidden />
                  )}
                  <div className="font-heading font-black text-[10px] tracking-[0.16em] opacity-90">FIXED WITH {match.product.name.toUpperCase()}</div>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-3 justify-center">
            <button className="all-unset bg-text text-bg px-6 py-4 font-heading font-black text-sm tracking-[0.14em] hover:bg-accent">SHARE YOUR REPAIR</button>
            <Link href="/" className="all-unset border-2 border-text px-6 py-4 font-heading font-black text-sm tracking-[0.14em] hover:bg-text hover:text-bg">FIX SOMETHING ELSE</Link>
          </div>
        </div>
      )}
    </div>
  );
}
