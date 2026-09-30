"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import { primaryNav } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const actions = [
  { id: "waivers", label: "Waivers" },
  { id: "propose-trade", label: "Propose Trade" },
  { id: "transactions", label: "Transactions" },
] as const;

const groupHeadingClassName =
  "**:[[cmdk-group-heading]]:label-system **:[[cmdk-group-heading]]:px-2.5 **:[[cmdk-group-heading]]:pt-3 **:[[cmdk-group-heading]]:pb-1.5 **:[[cmdk-group-heading]]:text-[10px] **:[[cmdk-group-heading]]:text-foreground-tertiary";

const itemClassName =
  "group flex cursor-default items-center gap-3 rounded-control px-2.5 py-2 text-sm text-foreground outline-none data-[selected=true]:bg-accent/10";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const keyBuffer = useRef<{ key: string; time: number } | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        handleOpenChange(!open);
        return;
      }

      if (open || isEditable) return;

      const now = Date.now();
      const buffered = keyBuffer.current;
      if (buffered && buffered.key === "g" && now - buffered.time < 600) {
        const match = primaryNav.find(
          (item) => item.shortcutKey === e.key.toLowerCase()
        );
        if (match) {
          e.preventDefault();
          router.push(match.href);
        }
        keyBuffer.current = null;
        return;
      }

      if (e.key.toLowerCase() === "g" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        keyBuffer.current = { key: "g", time: now };
      } else {
        keyBuffer.current = null;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, router]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setQuery("");
  }

  function go(href: string) {
    handleOpenChange(false);
    router.push(href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        className="label-system flex items-center gap-2 rounded-control border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground-secondary transition-colors hover:bg-surface-elevated"
      >
        <Search className="size-3.5" strokeWidth={2} />
        <span className="hidden sm:inline">Search</span>
        <span className="hidden rounded border border-border px-1 py-0.5 text-[10px] text-foreground-tertiary sm:inline">
          ⌘K
        </span>
      </button>

      <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
          <DialogPrimitive.Popup className="fixed top-[16vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-soft border border-border bg-surface-elevated shadow-2xl shadow-black/40 outline-none transition duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
            <DialogPrimitive.Title className="sr-only">
              Eleven command
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Jump to a screen or run an action.
            </DialogPrimitive.Description>

            <CommandPrimitive className="flex flex-col">
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <span className="label-system hidden shrink-0 text-[10px] text-foreground-tertiary sm:inline">
                  ELEVEN COMMAND
                </span>
                <CommandPrimitive.Input
                  autoFocus
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search navigation or actions…"
                  className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-tertiary"
                />
                <span className="label-system shrink-0 text-[10px] text-foreground-tertiary">
                  ESC
                </span>
              </div>

              <CommandPrimitive.List className="max-h-[60vh] overflow-y-auto p-2">
                <CommandPrimitive.Empty className="px-3 py-6 text-center text-sm text-foreground-tertiary">
                  No results.
                </CommandPrimitive.Empty>

                <CommandPrimitive.Group
                  heading="Navigation"
                  className={groupHeadingClassName}
                >
                  {primaryNav.map((item) => {
                    const Icon = item.icon;
                    return (
                      <CommandPrimitive.Item
                        key={item.href}
                        value={item.label}
                        onSelect={() => go(item.href)}
                        className={itemClassName}
                      >
                        <Icon
                          className="size-4 shrink-0 text-foreground-tertiary group-data-[selected=true]:text-accent"
                          strokeWidth={1.75}
                        />
                        <span className="flex-1">{item.label}</span>
                        <span className="label-system text-[10px] text-foreground-tertiary">
                          G {item.shortcutKey.toUpperCase()}
                        </span>
                      </CommandPrimitive.Item>
                    );
                  })}
                </CommandPrimitive.Group>

                <CommandPrimitive.Group
                  heading="Actions"
                  className={groupHeadingClassName}
                >
                  {actions.map((action) => (
                    <CommandPrimitive.Item
                      key={action.id}
                      value={action.label}
                      disabled
                      className={cn(itemClassName, "text-foreground-tertiary opacity-60")}
                    >
                      <span className="flex-1">{action.label}</span>
                      <span className="label-system text-[10px] text-foreground-tertiary">
                        SOON
                      </span>
                    </CommandPrimitive.Item>
                  ))}
                </CommandPrimitive.Group>
              </CommandPrimitive.List>
            </CommandPrimitive>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
