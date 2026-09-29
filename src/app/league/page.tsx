import { Trophy } from "lucide-react";
import { ComingSoon } from "@/components/shell/coming-soon";

export default function LeaguePage() {
  return (
    <ComingSoon
      icon={Trophy}
      title="League hub"
      description="Full standings, draft history and trade activity for The Boardroom are coming in a future step."
    />
  );
}
