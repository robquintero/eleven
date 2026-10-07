"use client";

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";

/** Keyboard support for the two existing, non-animated shell menus. */
export function useMenuFocus(open: boolean, setOpen: Dispatch<SetStateAction<boolean>>) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const panel = menuRef.current;
    if (!panel) return;
    const items = Array.from(panel.querySelectorAll<HTMLElement>('[role="menuitem"], [role="option"]'));
    function focusItem(index: number) {
      items.forEach((item, i) => { item.tabIndex = i === index ? 0 : -1; });
      items[index]?.focus();
    }
    focusItem(Math.max(0, items.findIndex(item => item.getAttribute("aria-selected") === "true")));
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      } else if (panel?.contains(document.activeElement) && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const index = items.indexOf(document.activeElement as HTMLElement);
        focusItem(event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length);
      }
    }
    function focusOutside(event: FocusEvent) {
      if (!panel?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", keydown);
    document.addEventListener("focusin", focusOutside);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("focusin", focusOutside);
    };
  }, [open, setOpen]);
  return { triggerRef, menuRef };
}
