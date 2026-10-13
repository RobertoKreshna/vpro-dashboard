"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function StaffError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto mt-16 max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
      <TriangleAlert className="mx-auto size-8 text-destructive" />
      <h1 className="mt-3 text-lg font-semibold">Something went wrong</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        This page couldn&apos;t be loaded. Try again, and if it keeps happening let the admin know
        {error.digest ? ` (ref ${error.digest})` : ""}.
      </p>
      <Button type="button" className="mt-4" onClick={() => retry()}>
        Try again
      </Button>
    </div>
  );
}
