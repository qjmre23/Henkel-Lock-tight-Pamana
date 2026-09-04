"use client";

import { useEffect, useState } from "react";

type Slide = { url: string; label: string; credit: string };

const SLIDES: Slide[] = [
  {
    url: "https://m.media-amazon.com/images/I/51n8v7spbgL.jpg",
    label: "LOCTITE Super Glue Liquid Professional",
    credit: "Amazon.com listing photo",
  },
  {
    url: "https://m.media-amazon.com/images/I/51UHlTQ6WuL._AC_SY879_.jpg",
    label: "LOCTITE Power Grab All Purpose",
    credit: "Amazon.com listing photo",
  },
  {
    url: "https://m.media-amazon.com/images/I/81dUpoOG+kL._SX342_.jpg",
    label: "LOCTITE Epoxy Instant Mix 5 Min",
    credit: "Amazon.com listing photo",
  },
];

export default function HeroCarousel() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActive((v) => (v + 1) % SLIDES.length), 3800);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative min-h-[32vh] md:min-h-0 md:h-full bg-neutral-300 overflow-hidden">
      {SLIDES.map((s, i) => (
        <img
          key={s.url}
          src={s.url}
          alt={s.label}
          className="absolute inset-0 w-full h-full object-contain bg-neutral-100 transition-opacity duration-700"
          style={{ opacity: i === active ? 1 : 0 }}
        />
      ))}
      <div className="absolute right-0 top-0 bg-accent text-white px-3.5 py-2.5 font-heading font-black text-[11px] tracking-[0.16em]">
        FIXABLE?
      </div>
      <div className="absolute left-0 bottom-0 right-0 flex items-end justify-between gap-3 p-4 bg-gradient-to-t from-black/55 to-transparent">
        <span className="font-heading font-extrabold text-[11px] tracking-[0.1em] text-white uppercase">
          {SLIDES[active].label}
        </span>
        <div className="flex gap-1.5">
          {SLIDES.map((s, i) => (
            <button
              key={s.url}
              aria-label={`Show slide ${i + 1}`}
              onClick={() => setActive(i)}
              className={`w-2 h-2 rounded-full transition-colors ${i === active ? "bg-white" : "bg-white/40"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
