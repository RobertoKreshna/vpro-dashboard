"use client";

import * as React from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { PHOTO_BUCKET, photoUrl } from "@/lib/constants";
import { resizeImage } from "@/lib/resize-image";
import { cn } from "@/lib/utils";
import {
  deletePhoto,
  registerPhotos,
  reorderPhotos,
  setCoverPhoto,
} from "@/app/(staff)/listings/actions";

type Photo = { id: string; path: string; isCover: boolean };
const MAX_BYTES = 10 * 1024 * 1024;
/** Originals up to this size are accepted because they are shrunk before upload; the shrunk file must still fit MAX_BYTES. */
const MAX_ORIGINAL_BYTES = 40 * 1024 * 1024;

export function PhotoManager({ listingId, initial }: { listingId: string; initial: Photo[] }) {
  const [photos, setPhotos] = React.useState(initial);
  const [uploading, setUploading] = React.useState(false);
  const [busy, startBusy] = React.useTransition();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = React.useState(false);

  // Server revalidation delivers fresh rows (new ids after upload).
  const [prevInitial, setPrevInitial] = React.useState(initial);
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setPhotos(initial);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function upload(files: FileList | File[]) {
    const list = [...files].filter((f) => {
      if (!f.type.startsWith("image/")) {
        toast.error(`${f.name} is not an image`);
        return false;
      }
      if (f.size > MAX_ORIGINAL_BYTES) {
        toast.error(`${f.name} is larger than 40 MB`);
        return false;
      }
      return true;
    });
    if (!list.length) return;
    setUploading(true);
    try {
      const supabase = createClient();
      const paths: string[] = [];
      for (const original of list) {
        const f = await resizeImage(original);
        if (f.size > MAX_BYTES) {
          toast.error(`${original.name} is larger than 10 MB`);
          continue;
        }
        const ext = (f.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `${listingId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, f, {
          contentType: f.type,
          cacheControl: "31536000",
        });
        if (error) toast.error(`${original.name}: ${error.message}`);
        else paths.push(path);
      }
      if (paths.length) {
        await registerPhotos(listingId, paths);
        toast.success(`${paths.length} photo${paths.length > 1 ? "s" : ""} uploaded`);
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = photos.findIndex((p) => p.id === active.id);
    const to = photos.findIndex((p) => p.id === over.id);
    const next = arrayMove(photos, from, to);
    setPhotos(next);
    startBusy(async () => {
      await reorderPhotos(listingId, next.map((p) => p.id));
    });
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (e.dataTransfer.files.length) {
            e.preventDefault();
            setDragOver(false);
            void upload(e.dataTransfer.files);
          }
        }}
        className={cn(
          "flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition",
          dragOver ? "border-primary bg-brand-light/40" : "border-input bg-white",
        )}
      >
        <ImagePlus className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Drop images here or</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          id="photo-input"
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
        <Button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading && <Loader2 className="animate-spin" />} Choose photos
        </Button>
        <p className="text-xs text-muted-foreground">JPG, PNG or WebP · up to 10 MB each</p>
      </div>

      {photos.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">
            Drag the handle to reorder. The starred photo is the cover shown in lists.
          </p>
          <DndContext id="photo-dnd" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={photos.map((p) => p.id)} strategy={rectSortingStrategy}>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {photos.map((p) => (
                  <PhotoTile
                    key={p.id}
                    photo={p}
                    disabled={busy}
                    onCover={() =>
                      startBusy(async () => {
                        setPhotos((l) => l.map((x) => ({ ...x, isCover: x.id === p.id })));
                        await setCoverPhoto(listingId, p.id);
                      })
                    }
                    onDelete={() =>
                      startBusy(async () => {
                        setPhotos((l) => l.filter((x) => x.id !== p.id));
                        await deletePhoto(listingId, p.id);
                        toast.success("Photo deleted");
                      })
                    }
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </>
      )}
    </div>
  );
}

function PhotoTile({
  photo,
  disabled,
  onCover,
  onDelete,
}: {
  photo: Photo;
  disabled: boolean;
  onCover: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: photo.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "relative overflow-hidden rounded-xl border bg-card shadow-sm",
        isDragging && "z-10 opacity-80 shadow-lg",
        photo.isCover && "ring-2 ring-primary",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoUrl(photo.path)!} alt="" className="aspect-[4/3] w-full object-cover" draggable={false} />
      {photo.isCover && (
        <span className="absolute left-2 top-2 rounded-full bg-brand-yellow px-2 py-0.5 text-xs font-bold text-[#1f2937]">
          Cover
        </span>
      )}
      <div className="flex items-center justify-between gap-1 p-1.5">
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="touch-none cursor-grab rounded-md p-1.5 hover:bg-muted active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
        <div className="flex gap-1">
          <button
            aria-label="Set as cover"
            title="Set as cover"
            disabled={disabled || photo.isCover}
            onClick={onCover}
            className="rounded-md p-1.5 hover:bg-muted disabled:opacity-40"
          >
            <Star className={cn("size-4", photo.isCover && "fill-brand-yellow text-brand-yellow")} />
          </button>
          <button
            aria-label="Delete photo"
            title="Delete photo"
            disabled={disabled}
            onClick={onDelete}
            className="rounded-md p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-40"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
    </li>
  );
}
