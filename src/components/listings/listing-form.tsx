"use client";

import * as React from "react";
import Link from "next/link";
import { ImagePlus, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/common/field";
import { MoneyInput } from "@/components/common/money-input";
import { NativeSelect } from "@/components/common/native-select";
import { LISTING_STATUSES, PROPERTY_TYPES, RENTAL_PERIODS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { PlacePicker } from "@/components/listings/place-picker";
import { usePlaceOptions } from "@/lib/use-place-options";
import { addFacility, saveListing, type ListingFormState } from "@/app/(staff)/listings/actions";

export type ListingFormValues = {
  id: string;
  title: string;
  listingType: "sell" | "rent";
  price: number;
  rentalPeriod: "month" | "year" | null;
  propertyType: string;
  address: string;
  village: string;
  district: string;
  city: string;
  province: string;
  postalCode: string | null;
  landArea: number | null;
  buildingArea: number | null;
  bedrooms: number;
  bathrooms: number;
  facilities: string[];
  electricityWatts: number | null;
  latitude: number | null;
  longitude: number | null;
  salesCode: string;
  status: string;
  notes: string | null;
};

type Agent = { code: string; fullName: string; isActive: boolean };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

export function ListingForm({
  listing,
  prefill,
  draftId,
  agents,
  facilityOptions,
}: {
  listing?: ListingFormValues;
  /** Starting values for a new listing (from a reviewed draft); ignored when editing. */
  prefill?: Partial<Omit<ListingFormValues, "id">>;
  /** Marks this draft as approved once the listing is saved. */
  draftId?: string;
  agents: Agent[];
  facilityOptions: string[];
}) {
  const init = listing ?? prefill;
  const [state, action, pending] = React.useActionState<ListingFormState, FormData>(saveListing, {});
  const err = state.errors ?? {};
  const [type, setType] = React.useState<"sell" | "rent">(init?.listingType ?? "sell");
  const [options, setOptions] = React.useState(facilityOptions);
  const [selected, setSelected] = React.useState<string[]>(init?.facilities ?? []);
  const [newFacility, setNewFacility] = React.useState("");
  const [adding, startAdd] = React.useTransition();

  // ---- Location cascade: Province -> City -> District -> Village (official boundary names) ----
  const [province, setProvince] = React.useState(init?.province ?? "");
  const [city, setCity] = React.useState(init?.city ?? "");
  const [district, setDistrict] = React.useState(init?.district ?? "");
  const [village, setVillage] = React.useState(init?.village ?? "");
  const place = usePlaceOptions({ province, city, district });

  React.useEffect(() => {
    if (state.message) toast.error(state.message);
  }, [state]);

  // Facilities the listing already has but that were later removed from the master list.
  const allOptions = [...new Set([...options, ...selected])];
  const toggle = (f: string) =>
    setSelected((s) => (s.includes(f) ? s.filter((x) => x !== f) : [...s, f]));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        React.startTransition(() => action(fd));
      }}
      className="space-y-5"
      noValidate
    >
      {listing && <input type="hidden" name="id" value={listing.id} />}
      {draftId && <input type="hidden" name="draftId" value={draftId} />}
      {selected.map((f) => (
        <input key={f} type="hidden" name="facilities" value={f} />
      ))}

      <Section title="Basics">
        <Field label="Title / short description" required error={err.title} className="sm:col-span-2 lg:col-span-3" htmlFor="title">
          <Input id="title" name="title" defaultValue={init?.title} aria-invalid={!!err.title} />
        </Field>
        <Field label="Listing type" required error={err.listingType}>
          <div role="radiogroup" aria-label="Listing type" className="grid grid-cols-2 gap-1 rounded-lg border bg-muted p-1">
            {(["sell", "rent"] as const).map((t) => (
              <label
                key={t}
                className={cn(
                  "cursor-pointer rounded-md px-3 py-1.5 text-center text-sm font-semibold capitalize transition",
                  type === t ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <input type="radio" name="listingType" value={t} checked={type === t} onChange={() => setType(t)} className="sr-only" />
                {t}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Property type" required error={err.propertyType} htmlFor="propertyType">
          <NativeSelect id="propertyType" name="propertyType" defaultValue={init?.propertyType ?? ""} aria-invalid={!!err.propertyType}>
            <option value="" disabled>Select…</option>
            {PROPERTY_TYPES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </NativeSelect>
        </Field>
        {/* Rental period sits inside the price cell so choosing Rent never moves other fields. */}
        <Field label={type === "rent" ? "Price (IDR) & period" : "Price (IDR)"} required error={err.price ?? err.rentalPeriod} htmlFor="price">
          <div className="flex gap-2">
            <MoneyInput id="price" name="price" placeholder="1.500.000.000" defaultValue={init?.price} aria-invalid={!!err.price} className="min-w-0 flex-1" />
            {type === "rent" && (
              <div className="w-36 shrink-0">
                <NativeSelect aria-label="Rental period" name="rentalPeriod" defaultValue={init?.rentalPeriod ?? "month"} aria-invalid={!!err.rentalPeriod}>
                  {RENTAL_PERIODS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </NativeSelect>
              </div>
            )}
          </div>
        </Field>
      </Section>

      <Section title="Location">
        <Field label="Address" required error={err.address} className="sm:col-span-2 lg:col-span-3" htmlFor="address">
          <Input id="address" name="address" placeholder="Street, number, RT/RW" defaultValue={init?.address} aria-invalid={!!err.address} />
        </Field>
        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-4">
          <PlacePicker
            id="province" name="province" label="Province" required error={err.province}
            value={province} options={place.provinceOptions} loading={place.provinceLoading}
            onChange={(v) => { setProvince(v); setCity(""); setDistrict(""); setVillage(""); }}
          />
          <PlacePicker
            key={`c|${province}`}
            id="city" name="city" label="City / regency" required error={err.city}
            value={city} options={place.cityOptions} loading={place.cityLoading} disabled={!province}
            onChange={(v) => { setCity(v); setDistrict(""); setVillage(""); }}
          />
          <PlacePicker
            key={`d|${province}|${city}`}
            id="district" name="district" label="District (kecamatan)" required error={err.district}
            value={district} options={place.districtOptions} loading={place.districtLoading} disabled={!city}
            onChange={(v) => { setDistrict(v); setVillage(""); }}
          />
          <PlacePicker
            key={`v|${province}|${city}|${district}`}
            id="village" name="village" label="Village (kelurahan/desa)" required error={err.village}
            value={village} options={place.villageOptions} loading={place.villageLoading} disabled={!district}
            onChange={setVillage}
          />
        </div>
        <Field label="Postal code" error={err.postalCode} htmlFor="postalCode">
          <Input id="postalCode" name="postalCode" inputMode="numeric" maxLength={5} defaultValue={init?.postalCode ?? ""} aria-invalid={!!err.postalCode} />
        </Field>
        <Field
          label="Map coordinates"
          error={err.coordinates ?? (err.latitude || err.longitude ? "Latitude must be -90..90 and longitude -180..180" : undefined)}
          hint="Optional. In Google Maps, right-click the spot and click the numbers to copy, then paste here."
          htmlFor="coordinates"
          className="sm:col-span-2"
        >
          <Input
            id="coordinates"
            name="coordinates"
            placeholder="-6.2088, 106.8456"
            defaultValue={init?.latitude != null && init?.longitude != null ? `${init.latitude}, ${init.longitude}` : ""}
            aria-invalid={!!err.coordinates}
          />
        </Field>
      </Section>

      <Section title="Specifications">
        <Field label="Land area (m²)" error={err.landArea} htmlFor="landArea">
          <Input id="landArea" name="landArea" inputMode="decimal" defaultValue={init?.landArea ?? ""} />
        </Field>
        <Field label="Building area (m²)" error={err.buildingArea} htmlFor="buildingArea">
          <Input id="buildingArea" name="buildingArea" inputMode="decimal" defaultValue={init?.buildingArea ?? ""} />
        </Field>
        <Field label="Electricity (watts)" error={err.electricityWatts} htmlFor="electricityWatts">
          <Input id="electricityWatts" name="electricityWatts" inputMode="numeric" placeholder="2200" defaultValue={init?.electricityWatts ?? ""} />
        </Field>
        <Field label="Bedrooms" error={err.bedrooms} htmlFor="bedrooms">
          <Input id="bedrooms" name="bedrooms" type="number" min={0} defaultValue={init?.bedrooms ?? 0} />
        </Field>
        <Field label="Bathrooms" error={err.bathrooms} htmlFor="bathrooms">
          <Input id="bathrooms" name="bathrooms" type="number" min={0} defaultValue={init?.bathrooms ?? 0} />
        </Field>
      </Section>

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="mb-3 text-base font-semibold">Facilities</h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Facilities">
          {allOptions.map((f) => {
            const on = selected.includes(f);
            return (
              <button
                key={f}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(f)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                  on ? "border-primary bg-primary text-primary-foreground" : "bg-white hover:bg-brand-light/50",
                )}
              >
                {f}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex max-w-sm gap-2">
          <Input
            aria-label="New facility"
            placeholder="Add a new facility…"
            value={newFacility}
            onChange={(e) => setNewFacility(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.currentTarget.nextElementSibling as HTMLButtonElement | null)?.click();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={adding || !newFacility.trim()}
            onClick={() =>
              startAdd(async () => {
                const res = await addFacility(newFacility);
                if (res.error) return void toast.error(res.error);
                setOptions(res.facilities);
                const added = res.facilities.find((x) => x.toLowerCase() === newFacility.trim().replace(/\s+/g, " ").toLowerCase());
                if (added) setSelected((s) => (s.includes(added) ? s : [...s, added]));
                setNewFacility("");
              })
            }
          >
            {adding ? <Loader2 className="animate-spin" /> : <Plus />} Add
          </Button>
        </div>
      </section>

      <Section title="Agent & status">
        <Field label="Listed by (sales code)" required error={err.salesCode} htmlFor="salesCode">
          <NativeSelect id="salesCode" name="salesCode" defaultValue={init?.salesCode ?? ""} aria-invalid={!!err.salesCode}>
            <option value="" disabled>Select agent…</option>
            {agents.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} · {a.fullName}{a.isActive ? "" : " (inactive)"}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {listing && (
          <Field label="Status" htmlFor="status">
            <NativeSelect id="status" name="status" defaultValue={listing.status}>
              {LISTING_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </NativeSelect>
          </Field>
        )}
        <Field label="Internal notes" hint="Never shown publicly." className="sm:col-span-2 lg:col-span-3" htmlFor="notes">
          <Textarea id="notes" name="notes" rows={3} defaultValue={init?.notes ?? ""} />
        </Field>
      </Section>

      {!listing && (
        <section className="flex items-start gap-3 rounded-xl border border-dashed bg-card p-5">
          <ImagePlus className="mt-0.5 size-5 shrink-0 text-brand-ink" />
          <div>
            <h2 className="text-base font-semibold">Photos</h2>
            <p className="text-sm text-muted-foreground">
              Next step: after you create the listing, you can add photos right away.
            </p>
          </div>
        </section>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Link href={listing ? `/listings/${listing.id}` : "/listings"} className={buttonVariants({ variant: "outline", size: "lg" })}>
          Cancel
        </Link>
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />} {listing ? "Save changes" : "Create & add photos"}
        </Button>
      </div>
    </form>
  );
}
