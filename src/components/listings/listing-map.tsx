"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Feature, FeatureCollection } from "geojson";
import { Check, ChevronDown, ChevronRight, Loader2, Search, X } from "lucide-react";
import { buildRegencyIndex, cityKey, placeKey, provinceKey } from "@/lib/geo";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MapPoint } from "@/lib/listing-queries";
import { useMapHover } from "@/components/listings/map-hover";
import { useGeo } from "@/lib/use-geo";
import { useIsPhone, useIsTouch } from "@/lib/use-media";

type Count = { name: string; value: number; province?: string };
export type MapCounts = {
  provinceCounts: Count[];
  cityCounts: Count[];
  districtCounts: Count[];
  villageCounts: Count[];
};
type FProps = { name: string; kode: string; type?: string; province?: string; district?: string; uid?: string };
type Level = "country" | "province" | "city" | "district";
/** name = the database spelling of the region (what the URL filters use). */
type Entry = { count: number; name: string; province?: string };

const EMPTY = "#e8edf3";
const SELL = "#e8c12e";
const RENT = "#ffffff";
const RAMP: [number, string][] = [
  [0, "#d6ecf8"],
  [0.25, "#a9d6f0"],
  [0.5, "#4aa8de"],
  [0.75, "#2b78a8"],
  [1, "#14507a"],
];
const INDONESIA = { lon: [94, 146], lat: [-11.5, 6.5] };

function bbox(f: Feature): [number, number, number, number] | null {
  let w = 180, s = 90, e = -180, n = -90;
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") {
      const [x, y] = c as number[];
      w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y);
    } else if (Array.isArray(c)) c.forEach(walk);
  };
  walk((f.geometry as { coordinates: unknown }).coordinates);
  return w > e ? null : [w, s, e, n];
}

function padded([w, s, e, n]: [number, number, number, number], pad = 0.9) {
  const dx = Math.max(e - w, 0.004), dy = Math.max(n - s, 0.004);
  const cx = (w + e) / 2, cy = (s + n) / 2;
  return { lon: [cx - dx * pad, cx + dx * pad], lat: [cy - dy * pad, cy + dy * pad] };
}

/**
 * Bounding box of the "main body" of a set of features: ignores tiny far-away islands
 * (e.g. Makassar's offshore Sangkarrang islands) that would otherwise zoom the map way out.
 */
function mainBox(features: Feature[]): [number, number, number, number] | null {
  type Box = [number, number, number, number];
  const boxes: { b: Box; area: number }[] = [];
  for (const f of features) {
    const g = f.geometry as { type: string; coordinates: number[][][] | number[][][][] };
    const polys = (g.type === "Polygon" ? [g.coordinates] : g.coordinates) as number[][][][];
    for (const poly of polys) {
      let w = 180, s = 90, e = -180, n = -90;
      for (const [x, y] of poly[0]) {
        w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y);
      }
      if (w <= e) boxes.push({ b: [w, s, e, n], area: Math.max((e - w) * (n - s), 1e-10) });
    }
  }
  if (!boxes.length) return null;
  const total = boxes.reduce((a, x) => a + x.area, 0);
  const big = boxes.filter((x) => x.area >= total * 0.02);
  const u = (list: { b: Box }[]): Box => [
    Math.min(...list.map((x) => x.b[0])), Math.min(...list.map((x) => x.b[1])),
    Math.max(...list.map((x) => x.b[2])), Math.max(...list.map((x) => x.b[3])),
  ];
  const core = u(big.length ? big : boxes);
  // Keep anything touching the core (plus 15% slack): small enclaves near the mainland stay, distant islands don't.
  const mx = (core[2] - core[0]) * 0.15, my = (core[3] - core[1]) * 0.15;
  const near = boxes.filter(({ b }) => b[0] <= core[2] + mx && b[2] >= core[0] - mx && b[1] <= core[3] + my && b[3] >= core[1] - my);
  return u(near);
}

const fp = (f: Feature) => f.properties as FProps;

/** Keeps the previous reference while the value is deep-equal, so identical server data never triggers a redraw. */
function useStable<T>(value: T): T {
  const key = JSON.stringify(value);
  const [state, setState] = React.useState({ key, value });
  if (state.key !== key) setState({ key, value });
  return state.key === key ? state.value : value;
}

export default function ListingMap({
  counts: countsProp,
  points: pointsProp,
  listingBase = "/listings-public",
  defaultProvince,
}: {
  counts: MapCounts;
  points: MapPoint[];
  /** Where a clicked dot goes: `${listingBase}/<id>` ("/listings" for staff). */
  listingBase?: string;
  /** Province shown while the URL has no `province` key. Choosing "Indonesia" writes `province=` so the default doesn't come back. */
  defaultProvince?: string;
}) {
  const touch = useIsTouch();
  const phone = useIsPhone();
  const counts = useStable(countsProp);
  const points = useStable(pointsProp);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const urlProvince = params.get("province") ?? defaultProvince ?? "";
  const city = params.get("city") ?? "";
  const district = city ? (params.get("district") ?? "") : "";
  const village = district ? (params.get("village") ?? "") : "";
  // A city link without a province still drills correctly.
  const province = urlProvince || counts.cityCounts.find((c) => c.name === city)?.province || "";

  const el = React.useRef<HTMLDivElement>(null);
  const { hover, setHover } = useMapHover();
  const setHoverRef = React.useRef(setHover);
  React.useEffect(() => {
    setHoverRef.current = setHover;
  }, [setHover]);
  const drawn = React.useRef<{
    level: Level;
    shapeTrace: number;
    shapes: { uid: string; entry: Entry; selected: boolean }[];
    dotTrace: number;
    pointIds: string[];
  } | null>(null);

  // `go` must keep a stable identity (it is a dependency of the draw effect), so it reads the latest
  // search params from a ref instead of closing over them. Paging the list then never redraws the map.
  const paramsRef = React.useRef(params);
  React.useEffect(() => {
    paramsRef.current = params;
  }, [params]);
  const [navigating, startNav] = React.useTransition();
  const go = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(paramsRef.current.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else if (k === "province" && defaultProvince) next.set(k, "");
        else next.delete(k);
      }
      next.delete("page");
      const qs = next.toString();
      startNav(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [pathname, router, defaultProvince],
  );

  /* ---------- which tiles do we need? ---------- */
  const provinces = useGeo("/geo/provinces.json");
  const provFeature = React.useMemo(
    () => (province && provinces.data ? provinces.data.features.find((f) => provinceKey(fp(f).name) === provinceKey(province)) : undefined),
    [province, provinces.data],
  );
  const kab = useGeo(provFeature ? `/geo/kab/${fp(provFeature).kode}.json` : null);
  const cityFeature = React.useMemo(
    () => (city && kab.data ? buildRegencyIndex(kab.data.features).get(cityKey(city)) : undefined),
    [city, kab.data],
  );
  const kec = useGeo(cityFeature ? `/geo/kec/${fp(cityFeature).kode}.json` : null);
  const districtFeature = React.useMemo(
    () => (district && kec.data ? kec.data.features.find((f) => placeKey(fp(f).name) === placeKey(district)) : undefined),
    [district, kec.data],
  );
  const kel = useGeo(districtFeature && cityFeature ? `/geo/kel/${fp(cityFeature).kode}.json` : null);

  const provinceOptions = React.useMemo(() => {
    if (!provinces.data) return [];
    const byKey = new Map<string, { count: number; db: string }>();
    for (const c of counts.provinceCounts) {
      const k = provinceKey(c.name);
      byKey.set(k, { count: (byKey.get(k)?.count ?? 0) + c.value, db: byKey.get(k)?.db ?? c.name });
    }
    return provinces.data.features
      .map((f) => {
        const hit = byKey.get(provinceKey(fp(f).name));
        return { name: fp(f).name, db: hit?.db ?? fp(f).name, count: hit?.count ?? 0 };
      })
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [provinces.data, counts.provinceCounts]);

  /* ---------- what to draw at the current level ---------- */
  const view = React.useMemo(() => {
    const entries = new Map<string, Entry>();
    const unmatched: Count[] = [];
    let features: Feature[] = [];
    let note = "";
    let focus: Feature | null = null;
    let level: Level = "country";

    const total = (list: Count[]) => list.reduce((n, c) => n + c.value, 0);
    const single = (f: Feature, count: number, name: string) => {
      features = [f];
      if (count) entries.set(fp(f).uid!, { count, name });
    };

    if (!province) {
      if (!provinces.data) return null;
      features = provinces.data.features;
      const index = new Map(features.map((f) => [provinceKey(fp(f).name), f]));
      for (const c of counts.provinceCounts) {
        const f = index.get(provinceKey(c.name));
        if (!f) unmatched.push(c);
        else entries.set(fp(f).uid!, { count: (entries.get(fp(f).uid!)?.count ?? 0) + c.value, name: c.name });
      }
    } else {
      level = "province";
      if (!provinces.data || kab.loading || (provFeature && kab.data === undefined)) return null;
      if (!provFeature || !kab.data) {
        if (!provFeature) return null;
        single(provFeature, total(counts.cityCounts.filter((c) => provinceKey(c.province ?? "") === provinceKey(province))), province);
        note = "City-level boundaries aren't available for this province.";
      } else {
        const cities = counts.cityCounts.filter((c) => provinceKey(c.province ?? "") === provinceKey(province));
        const index = buildRegencyIndex(kab.data.features);
        features = kab.data.features;
        for (const c of cities) {
          const f = index.get(cityKey(c.name));
          if (!f) unmatched.push(c);
          else entries.set(fp(f).uid!, { count: (entries.get(fp(f).uid!)?.count ?? 0) + c.value, name: c.name, province: c.province });
        }
        if (city) {
          level = "city";
          if (!cityFeature) {
            note = `No boundary found for "${city}".`;
            level = "province";
          } else {
            if (kec.loading || kec.data === undefined) return null;
            const cityTotal = total(counts.districtCounts);
            if (!kec.data) {
              single(cityFeature, cityTotal, city);
              note = `District boundaries for ${city} aren't installed (run "bun run geo:build").`;
            } else {
              features = kec.data.features;
              entries.clear();
              unmatched.length = 0;
              const kecIndex = new Map(features.map((f) => [placeKey(fp(f).name), f]));
              for (const c of counts.districtCounts) {
                const f = kecIndex.get(placeKey(c.name));
                if (!f) unmatched.push(c);
                else entries.set(fp(f).uid!, { count: (entries.get(fp(f).uid!)?.count ?? 0) + c.value, name: c.name });
              }
              if (district) {
                if (!districtFeature) {
                  note = `No boundary found for district "${district}".`;
                } else {
                  level = "district";
                  if (kel.loading || kel.data === undefined) return null;
                  const distTotal = total(counts.villageCounts);
                  if (!kel.data) {
                    single(districtFeature, distTotal, district);
                    note = `Village boundaries for ${city} aren't installed (run "bun run geo:build").`;
                  } else {
                    features = kel.data.features.filter((f) => fp(f).district === fp(districtFeature).kode);
                    entries.clear();
                    unmatched.length = 0;
                    const kelIndex = new Map(features.map((f) => [placeKey(fp(f).name), f]));
                    for (const c of counts.villageCounts) {
                      const f = kelIndex.get(placeKey(c.name));
                      if (!f) unmatched.push(c);
                      else entries.set(fp(f).uid!, { count: (entries.get(fp(f).uid!)?.count ?? 0) + c.value, name: c.name });
                    }
                    if (village) focus = kelIndex.get(placeKey(village)) ?? null;
                  }
                }
              }
            }
          }
        }
      }
    }
    return { features, entries, unmatched, note, focus, level };
  }, [province, city, district, village, provinces, kab, kec, kel, provFeature, cityFeature, districtFeature, counts]);

  /* ---------- draw ---------- */
  React.useEffect(() => {
    const node = el.current;
    if (!node || !view) return;
    let dead = false;
    (async () => {
      const Plotly = (await import("plotly.js-geo-dist-min")).default;
      if (dead) return;
      // Plotly fetches its world base map from cdn.plot.ly by default; serve it from this site instead (privacy + CSP).
      Plotly.setPlotConfig({ topojsonURL: "/geo/plotly/" });
      const fc: FeatureCollection = { type: "FeatureCollection", features: view.features };
      const uids = view.features.map((f) => fp(f).uid!);
      const names = view.features.map((f) => fp(f).name);
      const withData = view.features.filter((f) => view.entries.has(fp(f).uid!));
      const max = Math.max(1, ...[...view.entries.values()].map((e) => e.count));
      const selectedUid = view.focus ? fp(view.focus).uid : null;

      const data: unknown[] = [
        {
          type: "choropleth",
          geojson: fc,
          featureidkey: "properties.uid",
          locations: uids,
          z: uids.map(() => 0),
          text: names,
          colorscale: [[0, EMPTY], [1, EMPTY]],
          showscale: false,
          marker: { line: { color: "#ffffff", width: 0.6 } },
          hovertemplate: "<b>%{text}</b><br>0 listings<extra></extra>",
        },
      ];
      if (withData.length) {
        data.push({
          type: "choropleth",
          geojson: fc,
          featureidkey: "properties.uid",
          locations: withData.map((f) => fp(f).uid!),
          z: withData.map((f) => view.entries.get(fp(f).uid!)!.count),
          text: withData.map((f) => fp(f).name),
          zmin: 0,
          zmax: Math.max(max, 2),
          colorscale: RAMP,
          marker: {
            line: {
              color: withData.map((f) => (fp(f).uid === selectedUid ? "#1f2937" : "#ffffff")),
              width: withData.map((f) => (fp(f).uid === selectedUid ? 2.5 : 0.8)),
            },
          },
          colorbar: {
            // On phones a vertical legend with a title covers a big part of the map: use a slim, untitled one.
            ...(phone ? {} : { title: { text: "Listings" } }),
            thickness: phone ? 8 : 10,
            len: phone ? 0.35 : 0.5,
            x: 0.99,
            xanchor: "right",
            tickfont: { size: phone ? 10 : 12 },
            tickformat: "d",
            dtick: max <= 6 ? 1 : undefined,
            outlinewidth: 0,
          },
          hovertemplate: "<b>%{text}</b><br>%{z} listing(s)<extra></extra>",
        });
      }
      if (points.length) {
        data.push({
          type: "scattergeo",
          mode: "markers",
          lon: points.map((p) => p.lng),
          lat: points.map((p) => p.lat),
          text: points.map((p) => p.title),
          customdata: points.map((p) => [p.id, formatIDR(p.price) + (p.listingType === "rent" && p.rentalPeriod ? ` / ${p.rentalPeriod}` : "")]),
          marker: { size: 8, color: points.map((p) => (p.listingType === "sell" ? SELL : RENT)), line: { color: "#1f2937", width: 1.5 } },
          hovertemplate: "<b>%{text}</b><br>%{customdata[1]}<br><i>%{customdata[0]} · click to open</i><extra></extra>",
        });
      }

      let geo: Record<string, unknown> = { fitbounds: "locations" };
      if (view.level === "country") geo = { lonaxis: { range: INDONESIA.lon }, lataxis: { range: INDONESIA.lat } };
      else if (view.focus) {
        const box = bbox(view.focus);
        if (box) {
          const r = padded(box);
          geo = { lonaxis: { range: r.lon }, lataxis: { range: r.lat } };
        }
      } else if (view.level === "city" || view.level === "district") {
        const box = mainBox(view.features);
        if (box) {
          const r = padded(box, 0.6);
          geo = { lonaxis: { range: r.lon }, lataxis: { range: r.lat } };
        }
      }

      await Plotly.react(
        node,
        data,
        {
          margin: { l: 0, r: 0, t: 0, b: 0 },
          paper_bgcolor: "rgba(0,0,0,0)",
          geo: { ...geo, domain: { x: [0, 1], y: [0, 1] }, visible: false, bgcolor: "rgba(0,0,0,0)", projection: { type: "mercator" }, showframe: false },
          // Touch: a pannable map swallows the finger, so the page can't be scrolled past it. Tapping still drills down.
          dragmode: touch ? false : "pan",
          font: { family: "Inter, system-ui, sans-serif", color: "#1f2937" },
          hoverlabel: { font: { family: "Inter, system-ui, sans-serif" } },
        },
        { responsive: true, scrollZoom: !touch, displaylogo: false, displayModeBar: touch ? false : "hover", modeBarButtonsToRemove: ["select2d", "lasso2d", "toImage"] },
      );

      // The box height changes with the level on phones, and Plotly only re-measures on window resizes.
      Plotly.Plots.resize(node);

      drawn.current = {
        level: view.level,
        shapeTrace: withData.length ? 1 : -1,
        shapes: withData.map((f) => ({ uid: fp(f).uid!, entry: view.entries.get(fp(f).uid!)!, selected: fp(f).uid === selectedUid })),
        dotTrace: points.length ? data.length - 1 : -1,
        pointIds: points.map((p) => p.id),
      };

      const n = node as unknown as {
        removeAllListeners?: (e: string) => void;
        on?: (e: string, cb: (ev: { points: { location?: string; customdata?: string[] }[] }) => void) => void;
      };
      for (const e of ["plotly_click", "plotly_hover", "plotly_unhover"]) n.removeAllListeners?.(e);
      n.on?.("plotly_hover", (ev) => {
        const id = ev.points[0]?.customdata?.[0];
        if (id) setHoverRef.current({ id, city, province, district, village, source: "map" });
      });
      n.on?.("plotly_unhover", () => setHoverRef.current(null));
      n.on?.("plotly_click", (ev) => {
        const pt = ev.points[0];
        if (!pt) return;
        if (pt.customdata?.[0]) return router.push(`${listingBase}/${pt.customdata[0]}`);
        const entry = pt.location ? view.entries.get(pt.location) : undefined;
        if (!entry) return;
        if (view.level === "country") go({ province: entry.name, city: null, district: null, village: null });
        else if (view.level === "province") go({ province: entry.province ?? province, city: entry.name, district: null, village: null });
        else if (view.level === "city") go({ district: entry.name, village: null });
        else go({ village: entry.name === village ? null : entry.name });
      });
    })();
    return () => {
      dead = true;
    };
  }, [view, points, router, go, province, city, district, village, listingBase, touch, phone]);

  // Highlight on the map whatever is hovered in the list.
  React.useEffect(() => {
    const node = el.current;
    const d = drawn.current;
    if (!node || !d) return;
    let dead = false;
    (async () => {
      const Plotly = (await import("plotly.js-geo-dist-min")).default;
      if (dead || !node) return;
      if (d.dotTrace >= 0) {
        const on = (i: number) => d.pointIds[i] === hover?.id;
        await Plotly.restyle(
          node,
          { "marker.size": [d.pointIds.map((_, i) => (on(i) ? 15 : 8))], "marker.line.width": [d.pointIds.map((_, i) => (on(i) ? 2.5 : 1.5))] },
          [d.dotTrace],
        );
      }
      if (d.shapeTrace >= 0) {
        const key = { country: hover?.province, province: hover?.city, city: hover?.district, district: hover?.village }[d.level];
        const hit = (s: (typeof d.shapes)[number]) => !!hover && !!key && s.entry.name === key;
        await Plotly.restyle(
          node,
          {
            "marker.line.color": [d.shapes.map((s) => (hit(s) || s.selected ? "#1f2937" : "#ffffff"))],
            "marker.line.width": [d.shapes.map((s) => (hit(s) ? 3 : s.selected ? 2.5 : 0.8))],
          },
          [d.shapeTrace],
        );
      }
    })();
    return () => {
      dead = true;
    };
  }, [hover]);

  React.useEffect(() => {
    const node = el.current;
    return () => {
      import("plotly.js-geo-dist-min").then((m) => node && m.default.purge(node));
    };
  }, []);

  const loading = !view;
  const provinceLabel = province ? (provinceOptions.find((o) => provinceKey(o.name) === provinceKey(province))?.name ?? province) : "";
  const level = view?.level ?? (village ? "district" : district ? "district" : city ? "city" : province ? "province" : "country");
  const hint = {
    country: "Click a province to drill down.",
    province: "Click a city / regency.",
    city: "Click a district (kecamatan) to see its listings on the map.",
    district: "Click a sub-district (kelurahan / desa).",
  }[level];

  // Small regions are hard to hit with a finger, so touch devices also get a tap list of the regions that have listings.
  const drill = (entry: Entry) => {
    if (level === "country") go({ province: entry.name, city: null, district: null, village: null });
    else if (level === "province") go({ province: entry.province ?? province, city: entry.name, district: null, village: null });
    else if (level === "city") go({ district: entry.name, village: null });
    else go({ village: entry.name === village ? null : entry.name });
  };
  const chips = touch && view ? [...view.entries.values()].filter((e) => e.count > 0).sort((a, b) => b.count - a.count) : [];

  const crumb = (label: string, patch: Record<string, string | null>, current: boolean) =>
    current ? (
      <span className="px-1.5 py-0.5 font-semibold">{label}</span>
    ) : (
      <button type="button" onClick={() => go(patch)} className="rounded px-1.5 py-0.5 hover:bg-muted">
        {label}
      </button>
    );

  return (
    <div className="flex h-full min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="w-full sm:w-64">
          <ProvincePicker
            value={provinceLabel}
            options={provinceOptions}
            onChange={(db) => go({ province: db || null, city: null, district: null, village: null })}
            disabled={!provinces.data}
          />
        </div>
        {province && (
          <nav aria-label="Map location" className="flex flex-wrap items-center gap-0.5 text-sm">
            {crumb("Indonesia", { province: null, city: null, district: null, village: null }, false)}
            <ChevronRight className="size-3.5 text-muted-foreground" />
            {crumb(provinceLabel, { province, city: null, district: null, village: null }, !city)}
            {city && (
              <>
                <ChevronRight className="size-3.5 text-muted-foreground" />
                {crumb(city, { province, city, district: null, village: null }, !district)}
              </>
            )}
            {district && (
              <>
                <ChevronRight className="size-3.5 text-muted-foreground" />
                {crumb(district, { province, city, district, village: null }, !village)}
              </>
            )}
            {village && (
              <>
                <ChevronRight className="size-3.5 text-muted-foreground" />
                {crumb(village, {}, true)}
              </>
            )}
          </nav>
        )}
      </div>

      <div className={cn("relative flex-1 overflow-hidden rounded-xl border bg-[#f5f7fa]", level === "country" ? "max-sm:aspect-[17/10] max-sm:flex-none sm:min-h-[320px]" : "min-h-[360px] lg:min-h-[320px]")}>
        {(loading || navigating) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-brand-light/20 backdrop-blur-[2px]" role="status" aria-live="polite">
            <span className="flex items-center gap-2 rounded-full border border-brand-light bg-white px-3.5 py-1.5 text-sm font-medium text-brand-ink shadow-md">
              <Loader2 className="size-4 animate-spin text-brand" /> Loading map…
            </span>
          </div>
        )}
        <div ref={el} className="absolute inset-0" role="img" aria-label="Map of listing counts by region" />
        {points.length > 0 && (
          <div className="pointer-events-none absolute bottom-3 left-3 flex gap-3 rounded-lg bg-white/95 px-2.5 py-1.5 text-xs shadow">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full border-[1.5px] border-[#1f2937]" style={{ background: SELL }} />For sale</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full border-[1.5px] border-[#1f2937]" style={{ background: RENT }} />For rent</span>
          </div>
        )}
      </div>

      {chips.length > 0 && (
        <div className="-mx-1 flex max-w-full gap-2 overflow-x-auto px-1 pb-1" aria-label="Regions with listings">
          {chips.map((e) => (
            <button
              key={e.name}
              type="button"
              onClick={() => drill(e)}
              className={cn(
                "flex h-10 shrink-0 items-center gap-2 rounded-full border bg-white px-3.5 text-sm",
                e.name === village && "border-primary bg-brand-light/50 font-semibold",
              )}
            >
              {e.name}
              <span className="rounded-full bg-brand-light/70 px-2 py-0.5 text-xs font-semibold tabular-nums">{e.count}</span>
            </button>
          ))}
        </div>
      )}

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>{touch ? hint.replace("Click", "Tap") : `${hint} Drag to pan, scroll to zoom.`}</p>
        {view?.note && <p>{view.note}</p>}
        {view && view.unmatched.length > 0 && (
          <p>Not shown on the map (no matching boundary): {view.unmatched.map((u) => `${u.name} (${u.value})`).join(", ")}. They are still in the list.</p>
        )}
      </div>
    </div>
  );
}

function ProvincePicker({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string;
  options: { name: string; db: string; count: number }[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const root = React.useRef<HTMLDivElement>(null);
  const phone = useIsPhone();

  React.useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    // On phones the list is a bottom sheet: keep the page still behind it.
    const prev = document.body.style.overflow;
    if (phone) document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
      document.body.style.overflow = prev;
    };
  }, [open, phone]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQ("");
  };
  const term = q.trim().toLowerCase();
  const match = (n: string) => !term || n.toLowerCase().includes(term);
  const withListings = options.filter((o) => o.count > 0 && match(o.name));
  const others = options.filter((o) => o.count === 0 && match(o.name));
  const showAll = !term || "all indonesia".includes(term);

  const row = (label: string, count: number | null, v: string, key = label) => (
    <li key={key} role="option" aria-selected={value === label || (!value && !v)}>
      <button
        type="button"
        onClick={() => pick(v)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-3 text-left text-base hover:bg-brand-light/50 sm:py-2 sm:text-sm",
          (value === label || (!value && !v)) && "bg-brand-light/40 font-semibold",
        )}
      >
        <span className="flex items-center gap-2">
          <Check className={cn("size-4", value === label || (!value && !v) ? "opacity-100" : "opacity-0")} />
          {label}
        </span>
        {count !== null && count > 0 && (
          <span className="rounded-full bg-brand-light/70 px-2 py-0.5 text-xs font-semibold tabular-nums">{count}</span>
        )}
      </button>
    </li>
  );

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Province"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-white px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-60"
      >
        <span className="truncate">{value || "All Indonesia"}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition", open && "rotate-180")} />
      </button>
      {open && phone && <div className="fixed inset-0 z-[69] bg-black/40" onClick={() => setOpen(false)} aria-hidden />}
      {open && (
        <div
          className={cn(
            "overflow-hidden border bg-popover shadow-lg",
            phone
              ? "fixed inset-x-0 bottom-0 z-[70] flex max-h-[75dvh] flex-col rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
              : "absolute z-30 mt-1 w-full min-w-64 rounded-xl",
          )}
        >
          {phone && (
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-semibold">Province</span>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="-mr-1.5 rounded-lg p-1.5 hover:bg-muted">
                <X className="size-5" />
              </button>
            </div>
          )}
          <div className="relative border-b p-2">
            <Search className="pointer-events-none absolute left-4 top-4.5 size-4 text-muted-foreground" />
            <input
              autoFocus={!phone}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search province…"
              aria-label="Search province"
              className="h-10 w-full rounded-md border border-input bg-white pl-8 pr-2 text-base outline-none focus-visible:border-ring sm:h-9 sm:text-sm"
            />
          </div>
          <ul role="listbox" className={cn("overflow-auto overscroll-contain p-1", phone ? "min-h-0 flex-1" : "max-h-72")}>
            {showAll && row("All Indonesia", null, "")}
            {withListings.length > 0 && (
              <li role="presentation" className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                With listings
              </li>
            )}
            {withListings.map((o) => row(o.name, o.count, o.db))}
            {others.length > 0 && (
              <li role="presentation" className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                No listings yet
              </li>
            )}
            {others.map((o) => row(o.name, o.count, o.db))}
            {!showAll && withListings.length + others.length === 0 && (
              <li className="px-3 py-4 text-center text-sm text-muted-foreground">No province found.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
