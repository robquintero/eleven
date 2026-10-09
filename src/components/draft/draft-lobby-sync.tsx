"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createDraftSynchronizer } from "@/lib/draft-sync";
import { getDraftStatusAction } from "@/app/(app)/draft/actions";

/** A manager waiting for the commissioner must see the draft start too. */
export function DraftLobbySync({ leagueId }: { leagueId: string }) {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false, advanced = false;
    const sync = createDraftSynchronizer(async () => {
      const status = await getDraftStatusAction(leagueId);
      if (!cancelled && !advanced && (status === "in_progress" || status === "completed")) {
        advanced = true;
        router.refresh();
      }
    }, () => {}); // Poll/rejoin recovers a failed hint/read without inventing state.
    void sync.refresh();
    const timer = setInterval(() => { void sync.refresh(); }, 5000);
    const wake = () => { if (document.visibilityState !== "hidden") void sync.refresh(); };
    window.addEventListener("online", wake); window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    const supabase = createClient();
    const channel = supabase.channel(`draft-lobby:${leagueId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "drafts", filter: `league_id=eq.${leagueId}` }, sync.signal)
      .subscribe(status => {
        if (status === "SUBSCRIBED") void sync.refresh();
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") sync.signal();
      });
    return () => {
      cancelled = true; sync.dispose(); clearInterval(timer);
      window.removeEventListener("online", wake); window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
      void supabase.removeChannel(channel);
    };
  }, [leagueId, router]);
  return null;
}
