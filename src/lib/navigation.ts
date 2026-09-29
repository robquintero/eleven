import type { LucideIcon } from "lucide-react";
import { House, Shirt, Swords, Trophy, Users } from "lucide-react";

export interface NavDestination {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Second key of the "G then X" navigation shortcut. */
  shortcutKey: string;
}

export const primaryNav: NavDestination[] = [
  { href: "/", label: "Home", icon: House, shortcutKey: "h" },
  { href: "/matchup", label: "Matchup", icon: Swords, shortcutKey: "m" },
  { href: "/team", label: "Team", icon: Shirt, shortcutKey: "t" },
  { href: "/players", label: "Players", icon: Users, shortcutKey: "p" },
  { href: "/league", label: "League", icon: Trophy, shortcutKey: "l" },
];
