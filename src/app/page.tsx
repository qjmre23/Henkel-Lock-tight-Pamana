import Link from "next/link";
import HeroCarousel from "@/components/HeroCarousel";

const HERO_TAGS = ["Sole separation", "Cracked case", "Snapped prop", "Torn strap", "Broken clip"];

const YOUR_REPAIRS_DEMO = [
  { emoji: "\u{1F45F}", label: "Sneaker" },
  { emoji: "\u{1F392}", label: "Backpack" },
  { emoji: "\u{1F3A8}", label: "Cosplay Prop" },
];

export default function HomePage() {
  return (
    <div className="animate-rise flex flex-col min-h-screen">
      {/* top bar */}
      <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b-2 border-text sticky top-0 z-20 bg-bg">
        <div className="flex items-center gap-3">
          <div className="w-[26px] h-[26px] bg-accent" aria-hidden />
          <div className="font-heading font-black text-[13px] tracking-[0.14em] whitespace-nowrap">
            LOCTITE<span className="opacity-45"> / PH REPAIR</span>
          </div>
        </div>
      </div>

      {/* hero -- flex-1 so header + hero + marquee + "your repairs" row exactly
          fill the viewport with no forced scroll and no dead white space below */}
      <div className="grid md:grid-cols-2 border-b-2 border-text flex-1 min-h-[420px]">
        <div className="p-6 sm:p-10 lg:p-14 flex flex-col justify-center gap-5 border-r-0 md:border-r-2 border-text">
          <div className="inline-flex items-center gap-2 font-heading font-extrabold text-[11px] tracking-[0.18em] text-accent-700">
            <span className="w-2 h-2 bg-accent block" aria-hidden />
            PROTOTYPE / DEMO DATA
          </div>
          <h1 className="m-0 font-heading font-black uppercase leading-[.9] tracking-[-0.03em] text-5xl sm:text-6xl lg:text-7xl">
            Something<br />broke?
          </h1>
          <p className="m-0 font-medium leading-[1.35] max-w-[26ch] text-base sm:text-lg text-neutral-700">
            Don&apos;t throw it yet. Let&apos;s see if it can be fixed.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/repair"
              className="bg-accent text-white px-6 py-4 font-heading font-black text-sm tracking-[0.12em] inline-flex items-center gap-3.5 hover:bg-accent-600 transition-colors"
            >
              TRY A REPAIR <span className="text-[1.2em]">&#8594;</span>
            </Link>
            <Link
              href="/repair?screen=upload"
              className="border-2 border-text px-6 py-4 font-heading font-black text-sm tracking-[0.12em] inline-flex items-center gap-3.5 hover:bg-text hover:text-bg transition-colors"
            >
              UPLOAD YOUR ITEM <span className="text-[1.2em]">&#8593;</span>
            </Link>
          </div>
        </div>
        <HeroCarousel />
      </div>

      {/* marquee */}
      <div className="bg-accent text-white overflow-hidden border-b-2 border-text">
        <div className="flex w-max py-3 sm:py-3.5 font-heading font-black uppercase tracking-[0.04em] text-lg sm:text-2xl whitespace-nowrap animate-[lqMarquee_22s_linear_infinite]">
          {[...HERO_TAGS, ...HERO_TAGS].map((t, i) => (
            <span key={i} className="pr-7">
              {t} {i % 5 !== 4 ? <span className="pl-7">&#9679;</span> : null}
            </span>
          ))}
        </div>
      </div>

      {/* your repairs row */}
      <div className="flex flex-wrap items-center gap-4 sm:gap-8 px-5 sm:px-10 py-5 border-b-2 border-divider">
        <div className="font-heading font-black text-[11px] tracking-[0.18em] opacity-50">YOUR REPAIRS</div>
        <div className="flex flex-wrap gap-2.5">
          {YOUR_REPAIRS_DEMO.map((r) => (
            <div key={r.label} className="flex items-center gap-2 border-2 border-text px-3.5 py-2 font-heading font-extrabold text-xs tracking-[0.1em]">
              <span className="text-lg">{r.emoji}</span>
              {r.label.toUpperCase()}
            </div>
          ))}
        </div>
        <div className="font-heading font-black text-xs tracking-[0.1em] text-accent-700">
          WHAT ARE WE FIXING NEXT?
        </div>
      </div>
    </div>
  );
}
