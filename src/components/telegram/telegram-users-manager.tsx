"use client";

import * as React from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/common/confirm-delete";
import { Field } from "@/components/common/field";
import { formatDate } from "@/lib/format";
import { addTelegramUser, removeTelegramUser, type TelegramUserState } from "@/app/(staff)/telegram/actions";

type Row = { id: string; username: string; addedBy: string | null; createdAt: string };

export function TelegramUsersManager({ rows, envIds }: { rows: Row[]; envIds: string[] }) {
  const [state, action, pending] = React.useActionState<TelegramUserState, FormData>(addTelegramUser, {});
  const [removing, setRemoving] = React.useState<Row | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);
  const err = state.errors ?? {};

  React.useEffect(() => {
    if (state.ok) {
      toast.success("Telegram user added");
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <div className="space-y-5">
      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          React.startTransition(() => action(fd));
        }}
        noValidate
        className="rounded-xl border bg-card p-4 shadow-sm"
      >
        <h2 className="mb-3 text-base font-semibold">Add a user</h2>
        <div className="grid items-start gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Field
            label="Telegram user ID"
            htmlFor="telegramUserId"
            required
            error={err.telegramUserId}
            hint="Numbers only. They can find it by messaging the bot or @userinfobot."
          >
            <Input id="telegramUserId" name="telegramUserId" inputMode="numeric" placeholder="8585489236" autoComplete="off" aria-invalid={!!err.telegramUserId} />
          </Field>
          <Field label="Username or name" htmlFor="username" required error={err.username} hint="Just a label for staff, so you know who it is.">
            <Input id="username" name="username" placeholder="@budi or Budi" autoComplete="off" aria-invalid={!!err.username} />
          </Field>
          <Button type="submit" size="lg" disabled={pending} className="sm:mt-[1.625rem]">
            {pending ? <Loader2 className="animate-spin" /> : <Plus />} Add
          </Button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username / name</TableHead>
              <TableHead>Telegram ID</TableHead>
              <TableHead className="hidden sm:table-cell">Added by</TableHead>
              <TableHead className="hidden sm:table-cell">Added</TableHead>
              <TableHead className="text-right">Remove</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && envIds.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Nobody can use the bot yet. Add a user above.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id} className="hover:bg-brand-light/30">
                <TableCell className="font-medium">{r.username}</TableCell>
                <TableCell className="tabular-nums">{r.id}</TableCell>
                <TableCell className="hidden sm:table-cell">{r.addedBy ?? "-"}</TableCell>
                <TableCell className="hidden sm:table-cell">{formatDate(r.createdAt)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon-sm" aria-label={`Remove ${r.username}`} onClick={() => setRemoving(r)}>
                    <Trash2 className="text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {envIds.map((id) => (
              <TableRow key={`env-${id}`}>
                <TableCell className="text-muted-foreground">(from server setting)</TableCell>
                <TableCell className="tabular-nums">{id}</TableCell>
                <TableCell className="hidden sm:table-cell">-</TableCell>
                <TableCell className="hidden sm:table-cell">-</TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">Remove it in TELEGRAM_ALLOWED_USER_IDS</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.username}?`}
        description="They can no longer send listings to the bot. Drafts they already sent stay."
        confirmLabel="Remove"
        onConfirm={async () => {
          const res = await removeTelegramUser(removing!.id);
          if (!res.error) toast.success("Removed");
          return res;
        }}
      />
    </div>
  );
}
