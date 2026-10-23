"use client";

import Link from "next/link";
import { useState } from "react";
import { canVibrate } from "@/lib/audio";
import { formatDuration, formatPace, formatTimeOfDay } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import {
  DURATION_MS_MAX,
  MINUTE,
  PAGE_MS_MAX,
  PAGE_MS_MIN,
  PAGE_MS_STEP,
  viewSession,
} from "@/lib/session";
import { useApp } from "@/lib/store";
import type { ActiveSession } from "@/lib/types";
import { unitsFor } from "@/lib/units";
import { RestartIcon, StopIcon } from "../icons";
import { Button, Sheet, SettingRow, Stepper, Switch } from "../ui";

export function AdjustSheet({
  open,
  onClose,
  session,
}: {
  open: boolean;
  onClose: () => void;
  session: ActiveSession;
}) {
  const now = useNow();
  const v = viewSession(session, now);
  const settings = useApp((s) => s.settings);
  const totalPages = useApp((s) => s.books.find((b) => b.id === session.bookId)?.totalPages);
  const { setPageMs, setDuration, setTarget, restartPage, end, reset, updateSettings } = useApp.getState();
  const [confirmReset, setConfirmReset] = useState(false);
  const units = unitsFor(session.mode);
  const practice = session.mode === "practice";

  const close = () => {
    setConfirmReset(false);
    onClose();
  };
  const minDuration = Math.ceil((v.elapsed + MINUTE) / MINUTE) * MINUTE;
  const maxTarget = totalPages ? totalPages - session.startPage + 1 : 9999;

  return (
    <Sheet open={open} onClose={close} title="Adjust">
      <div className="divide-y divide-line">
        <SettingRow title={`Time per ${units.one}`} description={`Counts toward this ${units.one} too`}>
          <Stepper
            label={`time per ${units.one}`}
            value={session.pageMs}
            step={PAGE_MS_STEP}
            min={PAGE_MS_MIN}
            max={PAGE_MS_MAX}
            onChange={setPageMs}
          >
            {formatPace(session.pageMs)}
          </Stepper>
        </SettingRow>
        <SettingRow title={practice ? "Test length" : "Session length"} description={`Ends ${formatTimeOfDay(now + v.macroRemaining)}`}>
          <Stepper
            label="session length"
            value={session.durationMs}
            step={5 * MINUTE}
            min={minDuration}
            max={DURATION_MS_MAX}
            onChange={setDuration}
          >
            {formatDuration(session.durationMs)}
          </Stepper>
        </SettingRow>
        <SettingRow title="Target" description={`${units.count(v.pagesDone)} ${practice ? "done" : "read"} so far`}>
          <Stepper
            label={`target ${units.many}`}
            value={session.targetPages}
            step={1}
            min={v.pagesDone + 1}
            max={maxTarget}
            onChange={setTarget}
          >
            {session.targetPages}
          </Stepper>
        </SettingRow>
        <SettingRow title="Sound">
          <Switch label="Sound" checked={settings.sound} onChange={(sound) => updateSettings({ sound })} />
        </SettingRow>
        {canVibrate() && (
          <SettingRow title="Vibration">
            <Switch
              label="Vibration"
              checked={settings.vibration}
              onChange={(vibration) => updateSettings({ vibration })}
            />
          </SettingRow>
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <Button
          variant="secondary"
          onClick={() => {
            restartPage();
            close();
          }}
        >
          <RestartIcon size={17} /> Restart {units.one}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            end();
            close();
          }}
        >
          <StopIcon size={17} /> End session
        </Button>
      </div>

      {confirmReset ? (
        <div className="mt-3 animate-fade rounded-2xl bg-behind/10 p-4">
          <p className="text-[13px] leading-snug text-fg-2">
            Discard this session? Nothing from it is saved
            {session.bookId ? `, and the book goes back to page ${session.startPage}.` : "."}
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="secondary" className="flex-1" onClick={() => setConfirmReset(false)}>
              Keep reading
            </Button>
            <Button
              size="sm"
              variant="danger"
              className="flex-1"
              onClick={() => {
                close();
                reset();
              }}
            >
              Discard
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" size="sm" className="mt-2 w-full text-behind hover:text-behind" onClick={() => setConfirmReset(true)}>
          Reset session
        </Button>
      )}

      <nav className="mt-5 flex justify-center gap-6 border-t border-line pt-5 text-[13px] font-medium text-muted">
        {[
          ["/library", "Library"],
          ["/stats", "Stats"],
          ["/settings", "Settings"],
        ].map(([href, label]) => (
          <Link key={href} href={href} onClick={close} className="transition hover:text-fg">
            {label}
          </Link>
        ))}
      </nav>
    </Sheet>
  );
}
