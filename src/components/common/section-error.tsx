"use client";

import { catchError, type ErrorInfo } from "next/error";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

function Fallback({ title }: { title: string }, { error, retry }: ErrorInfo) {
  // Server errors arrive with a generic message; the digest ties it to the server log.
  const ref = (error as Error & { digest?: string }).digest;
  return (
    <div role="alert" className="rounded-xl border border-destructive/30 bg-card p-5 shadow-sm">
      <p className="flex items-center gap-2 font-semibold">
        <TriangleAlert className="size-4 text-destructive" /> {title}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Something went wrong while loading this section. The rest of the page still works.
        {ref && <span className="ml-1 text-xs">(ref {ref})</span>}
      </p>
      <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => retry()}>
        Try again
      </Button>
    </div>
  );
}

/** Wrap one dashboard section so a failing query only replaces that card instead of the whole page. */
export const SectionError = catchError(Fallback);
