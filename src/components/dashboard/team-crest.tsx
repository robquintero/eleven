import type { FantasyTeam } from "@/lib/types/fantasy";
import { cn } from "@/lib/utils";

const sizeClasses = {
  sm: "size-8 text-xs",
  md: "size-11 text-sm",
  lg: "size-16 text-lg",
} as const;

function initialsFor(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

export function TeamCrest({
  team,
  size = "md",
  className,
}: {
  team: FantasyTeam;
  size?: keyof typeof sizeClasses;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border font-semibold",
        sizeClasses[size],
        className
      )}
      style={{
        backgroundColor: `${team.crestColor}1f`,
        borderColor: `${team.crestColor}40`,
        color: team.crestColor,
      }}
      aria-hidden
    >
      {initialsFor(team.name)}
    </div>
  );
}
