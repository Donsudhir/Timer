import type { Metadata } from "next";
import { Hydrated } from "@/components/Hydrated";
import { StatsScreen } from "@/components/stats/StatsScreen";

export const metadata: Metadata = { title: "Stats" };

export default function Page() {
  return (
    <Hydrated>
      <StatsScreen />
    </Hydrated>
  );
}
