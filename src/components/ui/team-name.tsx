import { cn } from "@/lib/utils";

/** Full identity stays readable, including unbroken names, without width measurement. */
export function TeamName({ name, className }: { name: string; className?: string }) {
  return <span title={name} className={cn("min-w-0 text-balance [overflow-wrap:anywhere]", className)}>{name}</span>;
}
