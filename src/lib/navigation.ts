import type { LucideIcon } from "lucide-react";
import { House, ListChecks, Shirt, Swords, Trophy, Users } from "lucide-react";

export interface NavDestination {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Second key of the "G then X" navigation shortcut. */
  shortcutKey: string;
}

export const primaryNav: NavDestination[] = [
  { href: "/home", label: "Home", icon: House, shortcutKey: "h" },
  { href: "/matchup", label: "Matchup", icon: Swords, shortcutKey: "m" },
  { href: "/team", label: "Team", icon: Shirt, shortcutKey: "t" },
  { href: "/draft", label: "Draft", icon: ListChecks, shortcutKey: "d" },
  { href: "/players", label: "Players", icon: Users, shortcutKey: "p" },
  { href: "/league", label: "League", icon: Trophy, shortcutKey: "l" },
];
