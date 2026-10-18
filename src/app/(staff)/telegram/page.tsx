import { asc } from "drizzle-orm";
import { db } from "@/db";
import { telegramUsers } from "@/db/schema";
import { PageHeader } from "@/components/common/page-header";
import { DraftsTabs } from "@/components/drafts/drafts-tabs";
import { TelegramUsersManager } from "@/components/telegram/telegram-users-manager";
import { envAllowedIds } from "@/lib/telegram-access";

export const metadata = { title: "Telegram accounts" };
export const dynamic = "force-dynamic";

export default async function TelegramPage() {
  const rows = await db.select().from(telegramUsers).orderBy(asc(telegramUsers.username));
  const fromDb = new Set(rows.map((r) => String(r.telegramUserId)));
  return (
    <>
      <PageHeader
        title="Telegram accounts"
        description="Who can send listings to the Telegram bot. Changes apply immediately, with no redeploy."
      />
      <DraftsTabs active="telegram" />
      <TelegramUsersManager
        rows={rows.map((r) => ({ id: String(r.telegramUserId), username: r.username, addedBy: r.addedBy, createdAt: r.createdAt.toISOString() }))}
        // Backup IDs from the server setting: shown so nobody wonders why a person has access, but removed only there.
        envIds={envAllowedIds().filter((id) => !fromDb.has(id))}
      />
    </>
  );
}
