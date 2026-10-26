import { PageHeader } from "@/components/common/page-header";
import { ImportPanel } from "@/components/listings/import-panel";
import { SHEET_TAB } from "@/lib/sheet-import";

export const metadata = { title: "Import listings" };

export default function ImportListingsPage() {
  return (
    <>
      <PageHeader
        title="Import listings"
        description="Add many listings at once from a Google Sheet or an Excel file. You'll see what will be added before anything is saved. Each import adds new listings, so run it once per batch."
      />
      <ImportPanel tab={SHEET_TAB} />
    </>
  );
}
