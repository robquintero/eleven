"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

export interface PendingNavigation {
  href: string;
  label: string;
}

interface NavigationTransitionContextValue {
  pending: PendingNavigation | null;
  begin: (href: string, label: string) => void;
}

const NavigationTransitionContext = createContext<NavigationTransitionContextValue | null>(null);

/**
 * Pass 11.1: tracks "a primary-nav destination was just clicked and hasn't
 * rendered yet" so CommandTransitionOverlay can show a restrained
 * workspace-level loading state for perceptibly slow navigations only.
 * Deliberately scoped to the authenticated primary nav (DesktopNav/
 * MobileNav are the only callers of `begin()`) -- not a general
 * navigation-events framework. Cleared the instant the real pathname
 * changes; none of Eleven's routes define a `loading.tsx`, so that only
 * happens once the destination's full server response is ready, which is
 * exactly when the overlay should disappear.
 */
export function NavigationTransitionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [pending, setPending] = useState<PendingNavigation | null>(null);
  const previousPathname = useRef(pathname);

  useEffect(() => {
    if (previousPathname.current !== pathname) {
      previousPathname.current = pathname;
      setPending(null);
    }
  }, [pathname]);

  const begin = useCallback((href: string, label: string) => {
    setPending({ href, label });
  }, []);

  return (
    <NavigationTransitionContext.Provider value={{ pending, begin }}>
      {children}
    </NavigationTransitionContext.Provider>
  );
}

export function useNavigationTransition(): NavigationTransitionContextValue {
  const ctx = useContext(NavigationTransitionContext);
  if (!ctx) throw new Error("useNavigationTransition must be used within NavigationTransitionProvider");
  return ctx;
}

/**
 * True only for a plain, unmodified primary click -- never for Cmd/Ctrl/
 * Shift/Alt+click, a non-primary button (e.g. middle-click), or a click
 * another handler already prevented. These are exactly the cases where
 * the browser opens the link in a new tab/window instead of navigating
 * the current one, so the command overlay must never fire for them.
 */
export function isPlainLeftClick(event: MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    !event.defaultPrevented
  );
}
