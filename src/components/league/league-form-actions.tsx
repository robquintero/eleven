"use client";

import { useState } from "react";
import { Plus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CreateLeagueForm, JoinLeagueForm } from "./league-forms";

/** Existing actions and fields, mounted only when their flow is opened. */
export function LeagueFormActions({ choices = false }: { choices?: boolean }) {
  const [flow, setFlow] = useState<"create" | "join" | null>(null);
  return <Dialog open={flow !== null} onOpenChange={open => { if (!open) setFlow(null); }}>
    {choices ? <div className="onboarding-choices">
      <div><h2>Create a league</h2><p>Bring your managers together. You’ll be the commissioner and choose when to start the draft.</p><DialogTrigger onClick={() => setFlow("create")} render={<Button />}>Create league</DialogTrigger></div>
      <div><h2>Join a league</h2><p>Have an invite? Use the code from your commissioner and give your team a name.</p><DialogTrigger onClick={() => setFlow("join")} render={<Button variant="outline" />}>Join league</DialogTrigger></div>
    </div> : <div className="flex flex-wrap gap-2">
      <DialogTrigger onClick={() => setFlow("create")} render={<Button variant="outline" className="v2-secondary-button" />}><Plus className="size-4" />Create league</DialogTrigger>
      <DialogTrigger onClick={() => setFlow("join")} render={<Button variant="outline" className="v2-secondary-button" />}><UserPlus className="size-4" />Join league</DialogTrigger>
    </div>}
    <DialogContent className="eleven-v2 v2-dialog sm:max-w-md">
      <DialogTitle>{flow === "create" ? "Create a league" : "Join a league"}</DialogTitle>
      <DialogDescription>{flow === "create" ? "Build your league and name your first team." : "Use an invite code from your commissioner to join."}</DialogDescription>
      {flow === "create" ? <CreateLeagueForm key="create" /> : flow === "join" ? <JoinLeagueForm key="join" /> : null}
      <DialogClose render={<Button variant="outline" className="v2-secondary-button w-full" />}>Cancel</DialogClose>
    </DialogContent>
  </Dialog>;
}
