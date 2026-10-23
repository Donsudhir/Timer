"use client";

import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { alertAudio, canVibrate, vibrate } from "@/lib/audio";
import { plural } from "@/lib/format";
import { useApp, type BackupFile } from "@/lib/store";
import type { ThemePref } from "@/lib/types";
import { wakeLockSupported } from "@/lib/wakelock";
import { PageColumn } from "../Hydrated";
import { DownloadIcon, MonitorIcon, MoonIcon, SunIcon, UploadIcon, VolumeIcon } from "../icons";
import { useInstallPrompt } from "../runtime";
import { Button, Card, PageHeader, Segmented, SettingRow, Switch } from "../ui";

function isBackup(value: unknown): value is BackupFile {
  const v = value as BackupFile | null;
  return !!v && v.app === "pagepace" && Array.isArray(v.books) && Array.isArray(v.history);
}

export function SettingsScreen() {
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);
  const bookCount = useApp((s) => s.books.length);
  const sessionCount = useApp((s) => s.history.length);
  const liveSession = useApp((s) => !!s.active && s.active.status !== "finished");
  const { exportData, importData, clearAll } = useApp.getState();
  const installEvent = useInstallPrompt((s) => s.event);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<BackupFile | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const standalone = window.matchMedia("(display-mode: standalone)").matches;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);

  const testSound = () => {
    void alertAudio.unlock().then((ok) => {
      if (ok) alertAudio.play("page");
      else setNotice("This browser blocked audio. Check that the tab isn't muted.");
    });
    if (settings.vibration) vibrate("page");
  };

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pagepace-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const chooseFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isBackup(parsed)) throw new Error("not a backup");
      setPendingImport(parsed);
      setNotice(null);
    } catch {
      setNotice("That file isn't a PagePace backup.");
    }
  };

  return (
    <PageColumn>
      <PageHeader title="Settings" />

      <div className="space-y-8">
        <Section title="Appearance">
          <SettingRow title="Theme">
            <Segmented<ThemePref>
              label="Theme"
              value={settings.theme}
              onChange={(theme) => update({ theme })}
              options={[
                { value: "system", label: <MonitorIcon size={16} />, title: "Match system" },
                { value: "light", label: <SunIcon size={16} />, title: "Light" },
                { value: "dark", label: <MoonIcon size={16} />, title: "Dark" },
              ]}
            />
          </SettingRow>
        </Section>

        <Section title="Alerts">
          <SettingRow title="Sound" description="A chime when each page's time is up">
            <Switch label="Sound" checked={settings.sound} onChange={(sound) => update({ sound })} />
          </SettingRow>
          <div className="flex items-center gap-4 py-4">
            <VolumeIcon size={18} className="shrink-0 text-muted" />
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={settings.volume}
              disabled={!settings.sound}
              onChange={(e) => update({ volume: Number(e.target.value) })}
              aria-label="Volume"
              className="h-1 w-full cursor-pointer accent-fg disabled:opacity-35"
            />
            <Button size="sm" variant="secondary" onClick={testSound} disabled={!settings.sound && !settings.vibration}>
              Test
            </Button>
          </div>
          <SettingRow
            title="Vibration"
            description={canVibrate() ? "Buzz on each new page" : "Not supported on this device"}
          >
            <Switch
              label="Vibration"
              checked={settings.vibration && canVibrate()}
              disabled={!canVibrate()}
              onChange={(vibration) => update({ vibration })}
            />
          </SettingRow>
          <SettingRow
            title="Keep screen awake"
            description={wakeLockSupported() ? "While a session is running" : "Not supported in this browser"}
          >
            <Switch
              label="Keep screen awake"
              checked={settings.keepAwake && wakeLockSupported()}
              disabled={!wakeLockSupported()}
              onChange={(keepAwake) => update({ keepAwake })}
            />
          </SettingRow>
        </Section>

        <Section title="Pace">
          <SettingRow
            title="Adaptive pace"
            description="Suggest a new time per page when you fall behind or get ahead"
          >
            <Switch
              label="Adaptive pace"
              checked={settings.adaptivePace}
              onChange={(adaptivePace) => update({ adaptivePace })}
            />
          </SettingRow>
        </Section>

        <Section title="Your data">
          <p className="pb-1 pt-4 text-[13px] leading-relaxed text-muted">
            Everything stays on this device — {plural(bookCount, "book")} and {plural(sessionCount, "session")}. Export a
            backup to move it or keep it safe.
          </p>
          <div className="flex flex-wrap gap-2 py-4">
            <Button size="sm" variant="secondary" onClick={exportBackup}>
              <DownloadIcon size={16} /> Export
            </Button>
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={liveSession}>
              <UploadIcon size={16} /> Import
            </Button>
            <Button size="sm" variant="ghost" className="text-behind hover:text-behind" onClick={() => setConfirmClear(true)} disabled={liveSession}>
              Erase all
            </Button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={chooseFile} />
          </div>
          {liveSession && <p className="pb-4 text-xs text-muted">Import and erase are available once the current session ends.</p>}

          {pendingImport && (
            <Confirm
              message={`Replace everything here with this backup (${plural(pendingImport.books.length, "book")}, ${plural(pendingImport.history.length, "session")})?`}
              action="Replace"
              onCancel={() => setPendingImport(null)}
              onConfirm={() => {
                importData(pendingImport);
                setPendingImport(null);
                setNotice("Backup restored.");
              }}
            />
          )}
          {confirmClear && (
            <Confirm
              message="Erase all books, sessions and settings from this device? This can't be undone."
              action="Erase"
              onCancel={() => setConfirmClear(false)}
              onConfirm={() => {
                clearAll();
                setConfirmClear(false);
                setNotice("All data erased.");
              }}
            />
          )}
          {notice && (
            <p className="pb-4 text-[13px] text-fg-2" role="status">
              {notice}
            </p>
          )}
        </Section>

        {!standalone && (installEvent || ios) && (
          <Section title="Install">
            <SettingRow
              title="Add PagePace to your home screen"
              description={installEvent ? "Opens full-screen and works offline" : "In Safari, tap Share, then “Add to Home Screen”"}
            >
              {installEvent && (
                <Button
                  size="sm"
                  onClick={async () => {
                    await installEvent.prompt();
                    useInstallPrompt.setState({ event: null });
                  }}
                >
                  Install
                </Button>
              )}
            </SettingRow>
          </Section>
        )}

        <p className="pb-4 text-center text-xs leading-relaxed text-muted">
          PagePace · No account, no tracking.
          <br />
          {ios && "On iPhone, alerts follow the ring/silent switch."}
        </p>
      </div>
    </PageColumn>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="label-caps mb-2 px-1">{title}</h2>
      <Card className="divide-y divide-line px-5">{children}</Card>
    </section>
  );
}

function Confirm({
  message,
  action,
  onCancel,
  onConfirm,
}: {
  message: string;
  action: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="mb-4 animate-fade rounded-2xl bg-behind/10 p-4">
      <p className="text-[13px] leading-snug text-fg-2">{message}</p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="secondary" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="danger" className="flex-1" onClick={onConfirm}>
          {action}
        </Button>
      </div>
    </div>
  );
}
