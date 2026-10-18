import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function Field({
  label,
  required,
  error,
  hint,
  className,
  children,
  htmlFor,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {/* One span: Label is a flex row with a gap, which would otherwise push the asterisk away from the text. */}
        <span>
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </span>
      </Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
