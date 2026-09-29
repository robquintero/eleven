import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { FantasyManager } from "@/lib/types/fantasy";

export function ProfileControl({ manager }: { manager: FantasyManager }) {
  return (
    <button
      type="button"
      className="flex items-center rounded-full transition-opacity hover:opacity-80"
      aria-label={`${manager.displayName} profile`}
    >
      <Avatar>
        <AvatarFallback className="bg-accent/15 font-semibold text-accent">
          {manager.initials}
        </AvatarFallback>
      </Avatar>
    </button>
  );
}
