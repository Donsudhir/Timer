import type { Metadata, Viewport } from "next";
import { Geist, Newsreader } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { Runtime } from "@/components/runtime";
import { themeScript } from "@/lib/theme-script";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: { default: "PagePace", template: "%s · PagePace" },
  description: "Finish pages, not just study hours. A calm, strict reading-pace timer.",
  applicationName: "PagePace",
  appleWebApp: { capable: true, title: "PagePace", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f4f0" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0c0b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${newsreader.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
        <Runtime />
      </body>
    </html>
  );
}
