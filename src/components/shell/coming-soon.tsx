import type { LucideIcon } from "lucide-react";

export function ComingSoon({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-foreground-secondary">
        <Icon className="size-5" strokeWidth={1.75} />
      </span>
      <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      <p className="mt-1.5 max-w-sm text-sm text-foreground-secondary">
        {description}
      </p>
    </div>
  );
}
