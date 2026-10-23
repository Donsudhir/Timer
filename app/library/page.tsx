import type { Metadata } from "next";
import { Hydrated } from "@/components/Hydrated";
import { LibraryScreen } from "@/components/library/LibraryScreen";

export const metadata: Metadata = { title: "Library" };

export default function Page() {
  return (
    <Hydrated>
      <LibraryScreen />
    </Hydrated>
  );
}
