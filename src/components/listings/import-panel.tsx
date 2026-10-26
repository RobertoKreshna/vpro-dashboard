"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Field } from "@/components/common/field";
import { cn } from "@/lib/utils";
import { applyImport, previewImport, type ImportResult } from "@/app/(staff)/listings/import/actions";
import type { PlanRow } from "@/lib/sheet-import";

const STORAGE_KEY = "vpro:import-sheet-link";
const SAVED_EVENT = "vpro:import-link";
const subscribeSaved = (cb: () => void) => {
  window.addEventListener(SAVED_EVENT, cb);
  return () => window.removeEventListener(SAVED_EVENT, cb);
};
const readSaved = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
};
const ACTION_STYLE: Record<PlanRow["action"], string> = {
  create: "bg-emerald-100 text-emerald-900",
  error: "bg-red-100 text-red-900",
};
const ACTION_LABEL: Record<PlanRow["action"], string> = { create: "New", error: "Error" };

export function ImportPanel({ tab }: { tab: string }) {
  // The last link used on this device pre-fills the box; typing overrides it.
  const saved = React.useSyncExternalStore(subscribeSaved, readSaved, () => "");
  const [typed, setTyped] = React.useState<string | null>(null);
  const link = typed ?? saved;
  const [mode, setMode] = React.useState<"sheet" | "file">("sheet");
  const [file, setFile] = React.useState<File | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [previewedKey, setPreviewedKey] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [busy, setBusy] = React.useState<"preview" | "apply" | null>(null);

  // Identifies what is selected right now, so an import can only run on exactly what was previewed.
  const key = mode === "file" ? (file ? `file:${file.name}:${file.size}:${file.lastModified}` : "") : link.trim() && `link:${link.trim()}`;

  const run = (kind: "preview" | "apply") => {
    const fd = new FormData();
    if (mode === "file" && file) fd.set("file", file);
    else fd.set("link", link.trim());
    setBusy(kind);
    startTransition(async () => {
      const res = await (kind === "preview" ? previewImport(fd) : applyImport(fd));
      setBusy(null);
      if (res.error) return void toast.error(res.error);
      if (mode === "sheet") {
        try {
          localStorage.setItem(STORAGE_KEY, link.trim());
          window.dispatchEvent(new Event(SAVED_EVENT));
        } catch {}
      }
      setResult(res);
      setPreviewedKey(key);
      if (res.done) toast.success(`Imported ${res.done.created} new ${res.done.created === 1 ? "listing" : "listings"}`);
    });
  };

  const plan = result?.plan;
  const importable = plan?.counts.create ?? 0;
  const stale = !!plan && previewedKey !== key;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div role="tablist" aria-label="Import from" className="mb-4 inline-flex rounded-lg border bg-muted p-0.5">
          {([["sheet", "Google Sheets link"], ["file", "Excel file"]] as const).map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                mode === m ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === "sheet" ? (
          <Field label="Google Sheets link" htmlFor="sheet-link" required hint={`Share the sheet as "Anyone with the link → Viewer". Rows are read from the tab named "${tab}".`}>
            <Input
              id="sheet-link"
              value={link}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              autoComplete="off"
              inputMode="url"
            />
          </Field>
        ) : (
          <Field label="Excel file" htmlFor="import-file" required hint={`.xlsx or .csv, up to 2 MB. Rows are read from the tab named "${tab}", or the first tab.`}>
            <Input id="import-file" type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="lg" onClick={() => run("preview")} disabled={pending || !key}>
            {busy === "preview" ? <Loader2 className="animate-spin" /> : <Search />} Preview
          </Button>
        </div>
      </div>

      {plan && (
        <div className="space-y-4" aria-live="polite">
          {result?.done && (
            <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-900">
              <CheckCircle2 className="size-4" /> Imported {result.done.created} new {result.done.created === 1 ? "listing" : "listings"}
              {result.done.skipped ? `. ${result.done.skipped} rows with errors were skipped.` : "."}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            {(["create", "error"] as const).map((a) => (
              <div key={a} className="rounded-xl border bg-card p-3 shadow-sm">
                <p className="text-2xl font-bold tabular-nums">{plan.counts[a]}</p>
                <p className="text-sm text-muted-foreground">{{ create: "New listings", error: "Errors (skipped)" }[a]}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Row</TableHead>
                  <TableHead>Listing</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plan.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">The sheet has no listing rows yet.</TableCell>
                  </TableRow>
                )}
                {plan.rows.map((r) => (
                  <TableRow key={r.line}>
                    <TableCell className="tabular-nums text-muted-foreground">{r.line}</TableCell>
                    <TableCell className="max-w-64">
                      <p className="truncate font-medium">{r.title || "(no title)"}</p>
                    </TableCell>
                    <TableCell>
                      <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", ACTION_STYLE[r.action])}>{ACTION_LABEL[r.action]}</span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.errors.length > 0 ? (
                        <ul className="list-disc space-y-0.5 pl-4 text-red-800">{r.errors.map((e) => <li key={e}>{e}</li>)}</ul>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {!result?.done && (
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={() => run("apply")} disabled={pending || stale || importable === 0}>
                {busy === "apply" ? <Loader2 className="animate-spin" /> : <Upload />} Import {importable} {importable === 1 ? "row" : "rows"}
              </Button>
              {stale && <p className="text-sm text-muted-foreground">The source changed. Preview again first.</p>}
              {plan.counts.error > 0 && <p className="text-sm text-muted-foreground">Rows with errors are skipped. Fix them in the sheet and import only those rows again, otherwise the rest will be added twice.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
