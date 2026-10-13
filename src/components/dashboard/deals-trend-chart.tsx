"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { getDealsOnDay, type DayDeal } from "@/app/(staff)/deals/actions";
import { TypeBadge } from "@/components/common/badges";
import { TrendBadge } from "@/components/dashboard/trend-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { compactIDR, formatIDR } from "@/lib/format";
import { dayShort, isWeekend, longDate, seriesColor, shortDate } from "@/lib/trend-helpers";
import { cn } from "@/lib/utils";
import type { DealTrend, TrendBy } from "@/lib/deal-trend";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const THIS_MONTH = "#2b78a8";
const LAST_MONTH = "#9ca3af";

const OPTIONS: { value: TrendBy; label: string }[] = [
  { value: "total", label: "Total" },
  { value: "payment", label: "By payment type" },
  { value: "sales", label: "By sales" },
];

type View = "all" | "daily";
const viewOptions = (days: boolean): { value: View; label: string }[] => [
  { value: "all", label: "Cumulative" },
  { value: "daily", label: days ? "Daily" : "Monthly" },
];

// Plotly decorates the graph div with these once a plot exists.
type PlotEl = HTMLElement & {
  on?: (ev: string, cb: (e: { points: { pointNumber: number }[] }) => void) => void;
  removeAllListeners?: (ev: string) => void;
};

function label(bucket: string, gran: "day" | "month") {
  if (gran === "day") return String(Number(bucket.slice(8)));
  return `${MONTHS[Number(bucket.slice(5, 7)) - 1]} ${bucket.slice(2, 4)}`;
}
function longLabel(bucket: string, gran: "day" | "month") {
  if (gran === "day") return longDate(bucket);
  return `${MONTHS[Number(bucket.slice(5, 7)) - 1]} ${bucket.slice(0, 4)}`;
}
/** Day ticks: short day name above the date; Saturdays and Sundays blue and bold. */
function dayTick(bucket: string) {
  const text = `${dayShort(bucket)}<br>${Number(bucket.slice(8))}`;
  return isWeekend(bucket) ? `<span style="color:#2b78a8"><b>${text}</b></span>` : text;
}
const cumulative = (a: number[]) => {
  let sum = 0;
  return a.map((v) => (sum += v));
};
/** Widths are compared in 40px steps so a drag-resize doesn't redraw on every pixel. */
const snap = (w: number) => Math.round(w / 40) * 40;
const plural = (n: number) => `${n} deal${n === 1 ? "" : "s"}`;
const sum = (a: number[], n: number) => a.slice(0, n).reduce((x, y) => x + y, 0);

type Compared = { curV: number[]; curC: number[]; oldV: number[]; oldC: number[] };

/** Hover card: white, rounded, soft shadow. Plotly's own hover box can't be styled that far, so it is switched off. */
function ChartTooltip({
  idx,
  trend,
  data,
  view,
  elapsed,
  versus,
  tipRef,
}: {
  idx: number;
  trend: DealTrend;
  data: Compared | null;
  view: View;
  elapsed: number;
  versus: "month" | "year";
  tipRef: React.RefObject<HTMLDivElement | null>;
}) {
  const days = trend.granularity === "day";
  const prev = trend.prev;
  let body: React.ReactNode;
  if (prev && data) {
    const now = days ? "month" : "year";
    const caption = view === "all" ? "Total to date" : days ? "Sales today" : "Sales this month";
    const oldBucket = prev.buckets[idx];
    const live = idx < elapsed;
    body = (
      <>
        <p className="mt-0.5 text-sm text-muted-foreground">{caption}</p>
        <div className="mt-2 space-y-1">
          {live && <TipRow label={`This ${now}`} color={THIS_MONTH} value={data.curV[idx]} n={data.curC[idx]} />}
          {oldBucket && (
            <TipRow
              label={`Last ${now} (${days ? shortDate(oldBucket) : longLabel(oldBucket, "month")})`}
              color="#6b7280"
              value={data.oldV[idx]}
              n={data.oldC[idx]}
            />
          )}
        </div>
        {live && oldBucket && (
          <div className="mt-2.5">
            <TrendBadge current={data.curV[idx]} previous={data.oldV[idx]} detail={false} versus={versus} />
          </div>
        )}
      </>
    );
  } else {
    const rows = trend.series
      .filter((s) => s.values[idx] > 0)
      .sort((a, b) => b.values[idx] - a.values[idx]);
    body = (
      <div className="mt-2 space-y-1">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No deals</p>}
        {rows.map((s) => (
          <TipRow key={s.name} label={s.name} color={seriesColor(s.name)} dot value={s.values[idx]} n={s.counts[idx]} />
        ))}
      </div>
    );
  }
  return (
    <div
      ref={tipRef}
      className="pointer-events-none absolute top-0 left-0 z-10 min-w-56 rounded-xl border border-black/5 bg-white px-4 py-3 shadow-lg shadow-black/10"
    >
      <p className="text-sm font-semibold text-foreground">{longLabel(trend.buckets[idx], trend.granularity)}</p>
      {body}
    </div>
  );
}

function TipRow({ label, color, value, n, dot }: { label: string; color: string; value: number; n: number; dot?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-6 text-sm">
      <span className="flex items-center gap-1.5" style={{ color }}>
        {dot && <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />}
        {label}
      </span>
      <span className="font-medium whitespace-nowrap text-foreground tabular-nums">
        {compactIDR(value)} <span className="text-xs font-normal text-muted-foreground">· {plural(n)}</span>
      </span>
    </div>
  );
}

const parseBy = (v: string | null): TrendBy => (v === "payment" || v === "sales" ? v : "total");

/** `trends` holds all three splits, so switching between them is a local state change (no server round trip). */
export function DealsTrendChart({ trends, initialBy, periodLabel }: { trends: Record<TrendBy, DealTrend>; initialBy: TrendBy; periodLabel: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const urlBy = parseBy(params.get("by"));
  const [by, setByState] = React.useState<TrendBy>(initialBy);
  // Follow the URL when it changes from outside (back / forward), not only our own clicks.
  const [seenUrlBy, setSeenUrlBy] = React.useState(urlBy);
  if (seenUrlBy !== urlBy) {
    setSeenUrlBy(urlBy);
    setByState(urlBy);
  }
  const trend = trends[by];
  const el = React.useRef<HTMLDivElement>(null);
  const [view, setView] = React.useState<View>("all");
  // The picked day is tied to the trend it was picked on, so changing the period or split clears it.
  const [pick, setPick] = React.useState<{ trend: DealTrend; day: string | null }>({ trend, day: null });
  const picked = pick.trend === trend ? pick.day : null;
  const [dayDeals, setDayDeals] = React.useState<{ day: string; rows: DayDeal[] } | null>(null);

  const setBy = (v: TrendBy) => {
    const next = new URLSearchParams(params.toString());
    if (v === "total") next.delete("by");
    else next.set("by", v);
    const qs = next.toString();
    setByState(v);
    setSeenUrlBy(v); // the URL is about to say the same thing; don't treat it as an outside change
    // Keeps the split in the address bar (refresh / share) without asking the server for a new page.
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  };

  const days = trend.granularity === "day";
  const prev = trend.prev;
  const versus = trend.prevKind ?? "month";
  const n = trend.buckets.length;
  const elapsed = trend.elapsed ?? n;
  const thisMonth = React.useMemo(
    () => trend.series[0] ?? { name: "Total", values: trend.buckets.map(() => 0), counts: trend.buckets.map(() => 0), total: 0 },
    [trend],
  );
  const hasData = trend.series.some((s) => s.total > 0) || (prev ? prev.total > 0 : false);
  const compared = React.useMemo<Compared | null>(() => {
    if (!prev) return null;
    const f = view === "all" ? cumulative : (a: number[]) => a;
    return { curV: f(thisMonth.values), curC: f(thisMonth.counts), oldV: f(prev.values), oldC: f(prev.counts) };
  }, [prev, thisMonth, view]);

  const wrap = React.useRef<HTMLDivElement>(null);
  const tip = React.useRef<HTMLDivElement>(null);
  const mouse = React.useRef({ x: 0, y: 0 });
  const [hover, setHover] = React.useState<number | null>(null);
  // Keep the card beside the cursor, flipping to its left near the right edge.
  const place = React.useCallback(() => {
    const box = tip.current;
    const area = wrap.current;
    if (!box || !area) return;
    const { x, y } = mouse.current;
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    let left = x + 16;
    if (left + w > area.clientWidth) left = x - 16 - w;
    const top = Math.min(Math.max(0, y - h / 2), Math.max(0, area.clientHeight - h));
    box.style.transform = `translate(${Math.max(0, left)}px, ${top}px)`;
  }, []);
  React.useLayoutEffect(place, [place, hover]);

  // This month so far vs the same number of days last month.
  const cmp = prev && {
    cur: sum(thisMonth.values, elapsed),
    old: sum(prev.values, elapsed),
    curN: sum(thisMonth.counts, elapsed),
    oldN: sum(prev.counts, elapsed),
  };

  React.useEffect(() => {
    if (!picked) return;
    let dead = false;
    getDealsOnDay(picked)
      .then((rows) => !dead && setDayDeals({ day: picked, rows }))
      .catch(() => !dead && setDayDeals({ day: picked, rows: [] }));
    return () => {
      dead = true;
    };
  }, [picked]);

  // Re-thin the axis labels when the chart is resized (window, sidebar, rotation), not only on first draw.
  const usedWidth = React.useRef(0);
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => {
    const node = el.current;
    if (!node || !hasData) return;
    const ro = new ResizeObserver(() => {
      const w = snap(node.clientWidth);
      if (w !== usedWidth.current) setWidth(w);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [hasData]);

  React.useEffect(() => {
    const node = el.current;
    if (!node || !hasData) return;
    let dead = false;
    (async () => {
      const Plotly = (await import("plotly.js-geo-dist-min")).default;
      if (dead) return;
      // x values are the long labels (shown as the hover header); tick text is the short form.
      const x = trend.buckets.map((b) => longLabel(b, trend.granularity));
      const width = node.clientWidth;
      usedWidth.current = snap(width);
      const narrow = width < 420;
      // Show every label that fits (about 36px each: "Sen" over a date), thinning evenly when space runs out.
      const plotWidth = width - (narrow ? 92 : 108) - 16;
      const every = Math.max(1, Math.ceil((days ? 36 : 56) / (plotWidth / n)));
      const tickIdx = trend.buckets.map((_, i) => i).filter((i) => i % every === 0);

      const compare = !!prev;
      const bars = compare && view === "daily";
      let data: Record<string, unknown>[];
      let peakValues: number[];
      if (prev) {
        const { curV, oldV } = compared!;
        const now = days ? "month" : "year";
        const curY = curV.map((v, i) => (i < elapsed ? v : null));
        const oldY = oldV.map((v, i) => (prev.buckets[i] ? v : null));
        // Hatched bars are weekends.
        const bar = (color: string, bucketsOf: (string | null)[]) => ({
          color,
          pattern: {
            shape: bucketsOf.map((b) => (days && b && isWeekend(b) ? "/" : "")),
            fgcolor: color,
            bgcolor: "#ffffff",
            size: 7,
            solidity: 0.5,
          },
        });
        // offsetgroup keeps last month's bar on the left even though this month is the first trace.
        const oldTrace = bars
          ? { type: "bar", offsetgroup: "old", marker: bar(LAST_MONTH, prev.buckets) }
          : { type: "scatter", mode: "lines+markers", line: { color: LAST_MONTH, width: 2, dash: "dash", shape: "linear" }, marker: { size: 4, color: LAST_MONTH } };
        const curTrace = bars
          ? { type: "bar", offsetgroup: "cur", marker: bar(THIS_MONTH, trend.buckets) }
          : { type: "scatter", mode: "lines+markers", line: { color: THIS_MONTH, width: 2.5, shape: "linear" }, marker: { size: 5, color: THIS_MONTH } };
        data = [
          { ...curTrace, name: `This ${now}`, x, y: curY, hoverinfo: "none" },
          { ...oldTrace, name: `Last ${now}`, x, y: oldY, hoverinfo: "none" },
        ];
        peakValues = [...curV.slice(0, elapsed), ...oldV];
      } else {
        data = trend.series.map((s) => ({
          type: "scatter",
          mode: "lines+markers",
          name: s.name,
          x,
          y: s.values,
          line: { color: seriesColor(s.name), width: 2.5, shape: "linear" },
          marker: { size: days ? 5 : 7, color: seriesColor(s.name) },
          hoverinfo: "none",
        }));
        peakValues = trend.series.flatMap((s) => s.values);
      }

      const vline = (i: number, color: string, dash?: string) => ({
        type: "line",
        xref: "x",
        yref: "paper",
        x0: i,
        x1: i,
        y0: 0,
        y1: 1,
        layer: dash ? "above" : "below",
        line: { color, width: dash ? 1.5 : 1, dash },
      });
      const shapes = days
        ? [
            ...trend.buckets.flatMap((b, i) => (isWeekend(b) ? [vline(i, "rgba(43,120,168,0.16)")] : [])),
            ...(picked ? [vline(trend.buckets.indexOf(picked), THIS_MONTH, "dash")] : []),
          ]
        : [];

      const xTitle =
        days ? `Day of month · ${periodLabel}` : periodLabel === "All time" ? "Month" : `Month · ${periodLabel}`;
      const peak = Math.max(1, ...peakValues);
      const ticks = Array.from({ length: 5 }, (_, i) => (peak * i) / 4);
      await Plotly.react(
        node,
        data,
        {
          margin: { l: narrow ? 92 : 108, r: 16, t: 8, b: days ? 96 : 74 },
          paper_bgcolor: "rgba(0,0,0,0)",
          plot_bgcolor: "rgba(0,0,0,0)",
          font: { family: "Inter, system-ui, sans-serif", color: "#1f2937", size: 12 },
          hovermode: "x",
          showlegend: compare || trend.series.length > 1,
          legend: { orientation: "h", y: days ? -0.38 : -0.3, x: 0, traceorder: "normal" },
          barmode: "group",
          bargap: 0.25,
          shapes,
          xaxis: {
            type: "category",
            showgrid: false,
            showspikes: true,
            spikemode: "across",
            spikesnap: "hovered data",
            spikethickness: 1,
            spikecolor: "#d1d5db",
            spikedash: "solid",
            tickangle: 0,
            fixedrange: true,
            // Daily ticks are annotations (below): Plotly's hover header reuses tick text, and we want the full date there.
            ...(days
              ? { showticklabels: false }
              : {
                  tickmode: "array",
                  tickvals: tickIdx.map((i) => x[i]),
                  ticktext: tickIdx.map((i) => label(trend.buckets[i], trend.granularity)),
                }),
            title: { text: xTitle, standoff: days ? 44 : 10, font: { size: 12, color: "#5b6675" } },
          },
          annotations: days
            ? tickIdx.map((i) => ({
                x: i,
                xref: "x",
                y: 0,
                yref: "paper",
                yanchor: "top",
                yshift: -8,
                showarrow: false,
                align: "center",
                text: dayTick(trend.buckets[i]),
              }))
            : [],
          yaxis: {
            rangemode: "tozero",
            gridcolor: "#e8edf3",
            zeroline: false,
            fixedrange: true,
            title: {
              text: compare && view === "all" ? "Cumulative deal value (Rp)" : "Total deal value (Rp)",
              standoff: 12,
              font: { size: 12, color: "#5b6675" },
            },
            tickvals: ticks,
            ticktext: ticks.map((t) => (t === 0 ? "Rp 0" : compactIDR(t))),
          },
        },
        { responsive: true, displaylogo: false, displayModeBar: false },
      );
      const plot = node as PlotEl;
      plot.removeAllListeners?.("plotly_click");
      plot.removeAllListeners?.("plotly_hover");
      plot.removeAllListeners?.("plotly_unhover");
      plot.on?.("plotly_hover", (e) => setHover(e.points[0]?.pointNumber ?? null));
      plot.on?.("plotly_unhover", () => setHover(null));
      if (days) {
        plot.on?.("plotly_click", (e) => {
          const day = trend.buckets[e.points[0]?.pointNumber];
          if (day) setPick((p) => ({ trend, day: p.trend === trend && p.day === day ? null : day }));
        });
      }
    })();
    return () => {
      dead = true;
    };
  }, [trend, hasData, periodLabel, view, picked, days, n, elapsed, prev, compared, width]);

  React.useEffect(() => {
    const node = el.current;
    return () => {
      import("plotly.js-geo-dist-min").then((m) => node && m.default.purge(node));
    };
  }, []);

  const clickable = days && hasData;
  const dayRows = picked && dayDeals?.day === picked ? dayDeals.rows : null;

  return (
    <div className={cn("rounded-xl border bg-card p-4 shadow-sm sm:p-5")}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Deal trend</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Total deal value in rupiah (jt = juta / million, M = miliar / billion) · {periodLabel} · per {days ? "day" : "month"}
          </p>
        </div>
        <div role="group" aria-label="Split chart by" className="inline-flex rounded-lg border bg-muted p-1">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={by === o.value}
              onClick={() => setBy(o.value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-semibold transition",
                by === o.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {cmp && hasData && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col items-start gap-1">
            <TrendBadge large current={cmp.cur} previous={cmp.old} versus={versus} />
            <span className="text-xs text-muted-foreground">
              {plural(cmp.curN)} vs {plural(cmp.oldN)} · first {elapsed} {days ? "days of the month" : "months of the year"}
            </span>
          </div>
          <div role="group" aria-label="Show cumulative or daily" className="inline-flex rounded-lg border bg-muted p-1">
            {viewOptions(days).map((v) => (
              <button
                key={v.value}
                type="button"
                aria-pressed={view === v.value}
                onClick={() => setView(v.value)}
                className={cn(
                  "rounded-md px-5 py-2 text-sm font-semibold transition",
                  view === v.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {hasData ? (
        <>
          <div
            ref={wrap}
            className="relative"
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              mouse.current = { x: e.clientX - r.left, y: e.clientY - r.top };
              place();
            }}
            onMouseLeave={() => setHover(null)}
          >
            <div
              ref={el}
              className={cn("h-[380px] w-full", clickable && "[&_.nsewdrag]:cursor-pointer!")}
              role="img"
              aria-label={`${prev && view === "daily" ? "Bar" : "Line"} chart of deal value per ${trend.granularity}`}
            />
            {hover !== null && hover < n && (
              <ChartTooltip idx={hover} trend={trend} data={compared} view={view} elapsed={elapsed} versus={versus} tipRef={tip} />
            )}
          </div>
          {clickable && (
            <p className="mt-2 text-xs text-muted-foreground">
              Click a day to see its deals.
              {prev && days && view === "daily" && " Hatched bars are Saturdays and Sundays."}
            </p>
          )}
        </>
      ) : (
        <p className="py-16 text-center text-sm text-muted-foreground">No deals in this period.</p>
      )}

      {picked && (
        <div className="mt-4 rounded-lg border">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <h3 className="text-sm font-semibold">
              Deals on {longDate(picked)}
              {dayRows && ` · ${plural(dayRows.length)}`}
            </h3>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setPick({ trend, day: null })}
              className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          {!dayRows ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : dayRows.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No deals on this day.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Deal</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead className="text-right">Final price</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Sold by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dayRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.id}</TableCell>
                    <TableCell>{r.buyerName}</TableCell>
                    <TableCell><TypeBadge type={r.dealType} /></TableCell>
                    <TableCell className="max-w-56 truncate">{r.address}, {r.city}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatIDR(r.finalPrice)}</TableCell>
                    <TableCell><Dot name={r.payment} /></TableCell>
                    <TableCell><Dot name={r.sales} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}

/** Coloured dot + name, using the same colour the chart gives that payment type / salesperson. */
function Dot({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span className="size-2.5 rounded-full" style={{ background: seriesColor(name) }} aria-hidden />
      {name}
    </span>
  );
}
