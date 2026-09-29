import Link from "next/link";

export function Wordmark() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground"
    >
      <span className="flex size-7 items-center justify-center rounded-soft bg-accent text-[13px] font-bold text-accent-foreground">
        11
      </span>
      <span className="hidden sm:inline">Eleven</span>
    </Link>
  );
}
