"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useHydrated } from "@/lib/hooks";
import { useApp } from "@/lib/store";
import { BookIcon, ChartIcon, LogoMark, SettingsIcon, TimerIcon } from "./icons";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Focus", icon: TimerIcon },
  { href: "/library", label: "Library", icon: BookIcon },
  { href: "/stats", label: "Stats", icon: ChartIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const status = useApp((s) => s.active?.status ?? null);
  const live = hydrated && (status === "running" || status === "paused");
  // The focus screen is immersive: no navigation while a session is live.
  // Until hydration we can't know, so keep "/" bare rather than flash the nav.
  const immersive = pathname === "/" && (live || !hydrated);
  const showLiveDot = live && pathname !== "/";

  return (
    <div className="flex min-h-dvh flex-col">
      {!immersive && (
        <header className="sticky top-0 z-30 hidden bg-bg/80 backdrop-blur-xl md:block">
          <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-8">
            <Link href="/" className="flex items-center gap-2.5" aria-label="PagePace home">
              <LogoMark size={24} />
              <span className="font-serif text-[22px] tracking-[-0.01em]">PagePace</span>
            </Link>
            <nav className="flex items-center gap-1" aria-label="Main">
              {NAV.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "relative flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
                      active ? "bg-surface-2 text-fg" : "text-muted hover:text-fg",
                    )}
                  >
                    {item.label}
                    {item.href === "/" && showLiveDot && (
                      <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-accent" aria-label="Session running" />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        </header>
      )}

      <main
        className={cx(
          "flex flex-1 flex-col",
          !immersive && "pb-[calc(env(safe-area-inset-bottom)+88px)] md:pb-16",
        )}
      >
        {children}
      </main>

      {!immersive && (
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-30 animate-fade border-t border-line bg-bg/85 pb-safe backdrop-blur-xl md:hidden"
        >
          <div className="mx-auto grid max-w-md grid-cols-4 px-2">
            {NAV.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "flex flex-col items-center gap-1 pb-2 pt-2.5 text-[10.5px] font-medium tracking-wide transition-colors",
                    active ? "text-fg" : "text-muted",
                  )}
                >
                  <span className="relative">
                    <Icon size={22} strokeWidth={active ? 2 : 1.6} />
                    {item.href === "/" && showLiveDot && (
                      <span className="absolute -right-1 -top-0.5 h-2 w-2 animate-breathe rounded-full bg-accent ring-2 ring-bg" />
                    )}
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
