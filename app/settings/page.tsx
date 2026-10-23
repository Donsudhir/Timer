import type { Metadata } from "next";
import { Hydrated } from "@/components/Hydrated";
import { SettingsScreen } from "@/components/settings/SettingsScreen";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return (
    <Hydrated>
      <SettingsScreen />
    </Hydrated>
  );
}
