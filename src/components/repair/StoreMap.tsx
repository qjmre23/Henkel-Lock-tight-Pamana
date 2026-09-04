"use client";

// ============================================================================
// StoreMap — TASK #11: real interactive Mapbox GL map for the NEAR screen's
// "Find Nearest" list.
//
// mapbox-gl needs the DOM/WebGL, so it's loaded with a dynamic import inside
// useEffect -- this never runs during SSR/build, avoiding any server-render
// crash. If NEXT_PUBLIC_MAPBOX_TOKEN isn't configured, or the map itself
// errors, this renders an honest "map unavailable" panel instead of a
// broken/blank map -- never a fake one.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Map as MapboxMap } from "mapbox-gl";

export interface MapStore {
  id: string;
  name: string;
  lat: number;
  lng: number;
  stock: "IN STOCK" | "LOW STOCK";
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const MAPBOX_STYLE = process.env.NEXT_PUBLIC_MAPBOX_STYLE || "mapbox://styles/mapbox/light-v11";

export default function StoreMap({ stores }: { stores: MapStore[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!MAPBOX_TOKEN) {
      setError("Mapbox token is not configured (NEXT_PUBLIC_MAPBOX_TOKEN).");
      return;
    }
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    import("mapbox-gl")
      .then((mod) => {
        const mapboxgl = mod.default;
        if (cancelled || !containerRef.current) return;
        mapboxgl.accessToken = MAPBOX_TOKEN;
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: MAPBOX_STYLE,
          center: stores.length ? [stores[0].lng, stores[0].lat] : [121.0509, 14.6507],
          zoom: 12.5,
        });
        map.addControl(new mapboxgl.NavigationControl(), "top-right");
        map.on("load", () => !cancelled && setLoaded(true));
        map.on("error", (e) => !cancelled && setError(e?.error?.message || "Map failed to load."));

        const bounds = new mapboxgl.LngLatBounds();
        for (const s of stores) {
          const el = document.createElement("div");
          el.style.width = "16px";
          el.style.height = "16px";
          el.style.borderRadius = "50%";
          el.style.border = "2px solid #fff";
          el.style.background = s.stock === "IN STOCK" ? "#12855b" : "#b26a00";
          el.style.boxShadow = "0 0 0 1px #1a1a1a";
          new mapboxgl.Marker({ element: el })
            .setLngLat([s.lng, s.lat])
            .setPopup(new mapboxgl.Popup({ offset: 14 }).setHTML(`<strong>${s.name}</strong><br/>${s.stock} · simulated`))
            .addTo(map);
          bounds.extend([s.lng, s.lat]);
        }
        if (stores.length > 1) map.fitBounds(bounds, { padding: 56, maxZoom: 14 });

        mapRef.current = map;
      })
      .catch((err) => !cancelled && setError(err?.message || "Failed to load Mapbox GL."));

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-xs text-neutral-600 bg-neutral-300">
        Map unavailable: {error}
      </div>
    );
  }

  return (
    <>
      <div ref={containerRef} className="absolute inset-0" />
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-neutral-600 bg-neutral-300 pointer-events-none">
          Loading map&#8230;
        </div>
      )}
    </>
  );
}
