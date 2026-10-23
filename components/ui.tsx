"use client";

import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type PointerEvent,
  type ReactNode,
} from "react";
import { clamp } from "@/lib/session";
import { CloseIcon, MinusIcon, PlusIcon } from "./icons";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cx(
    "inline-flex select-none items-center justify-center gap-2 rounded-full font-medium tracking-[-0.01em]",
    "transition-[transform,background-color,opacity,color] duration-200 active:scale-[0.97]",
    "disabled:pointer-events-none disabled:opacity-35",
    size === "lg" && "h-14 px-7 text-[15px]",
    size === "md" && "h-11 px-5 text-sm",
    size === "sm" && "h-9 px-4 text-[13px]",
    variant === "primary" && "bg-fg text-bg hover:opacity-90",
    variant === "secondary" && "bg-surface-2 text-fg hover:bg-line-strong",
    variant === "ghost" && "text-fg-2 hover:bg-surface-2 hover:text-fg",
    variant === "danger" && "bg-behind/10 text-behind hover:bg-behind/15",
    className,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({ variant = "primary", size = "md", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg-2 transition",
        "hover:bg-surface-2 hover:text-fg active:scale-95 disabled:pointer-events-none disabled:opacity-30",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx("rounded-[24px] bg-surface shadow-soft ring-1 ring-line", className)}>
      {children}
    </div>
  );
}

/** − value + with press-and-hold acceleration. */
export function Stepper({
  value,
  onChange,
  step,
  min = -Infinity,
  max = Infinity,
  children,
  label,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  step: number;
  min?: number;
  max?: number;
  children: ReactNode;
  label: string;
  className?: string;
}) {
  const latest = useRef(value);
  const timers = useRef<{ delay?: ReturnType<typeof setTimeout>; repeat?: ReturnType<typeof setInterval> }>({});

  useEffect(() => {
    latest.current = value;
  }, [value]);

  const stop = () => {
    clearTimeout(timers.current.delay);
    clearInterval(timers.current.repeat);
  };
  useEffect(() => stop, []);

  const bump = (dir: 1 | -1) => {
    const next = clamp(latest.current + dir * step, min, max);
    if (next === latest.current) return stop();
    latest.current = next;
    onChange(next);
  };

  const press = (dir: 1 | -1, e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    bump(dir);
    stop();
    timers.current.delay = setTimeout(() => {
      timers.current.repeat = setInterval(() => bump(dir), 70);
    }, 420);
  };

  const stepClass =
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-2 transition hover:text-fg active:scale-90 disabled:opacity-30 disabled:pointer-events-none";

  return (
    <div className={cx("flex items-center gap-2", className)} role="group" aria-label={label}>
      <button
        type="button"
        className={stepClass}
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onPointerDown={(e) => press(-1, e)}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onClick={(e) => e.detail === 0 && bump(-1)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <MinusIcon size={16} />
      </button>
      <div className="min-w-[4.5rem] text-center tabular text-[17px] font-medium tracking-tight" aria-live="polite">
        {children}
      </div>
      <button
        type="button"
        className={stepClass}
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onPointerDown={(e) => press(1, e)}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onClick={(e) => e.detail === 0 && bump(1)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <PlusIcon size={16} />
      </button>
    </div>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: Array<{ value: T; label: ReactNode; title?: string }>;
  value: T | null;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx("inline-flex rounded-full bg-surface-2 p-1", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cx(
              "inline-flex h-8 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium transition-all duration-200",
              active ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative h-7 w-[46px] shrink-0 rounded-full transition-colors duration-200 disabled:opacity-35",
        checked ? "bg-fg" : "bg-faint",
      )}
    >
      <span
        className={cx(
          "absolute left-[3px] top-[3px] h-[22px] w-[22px] rounded-full bg-bg shadow-sm transition-transform duration-300 ease-out-soft",
          checked && "translate-x-[18px]",
        )}
      />
    </button>
  );
}

export function Bar({
  value,
  marker,
  smooth,
  tone = "fg",
  className,
}: {
  value: number;
  /** Optional 0–1 position of a schedule marker. */
  marker?: number;
  /** Animate linearly over a second, for values that change every tick. */
  smooth?: boolean;
  tone?: "fg" | "accent" | "muted";
  className?: string;
}) {
  const pct = clamp(value, 0, 1) * 100;
  return (
    <div className={cx("relative h-1 w-full rounded-full bg-line-strong", className)}>
      <div
        className={cx(
          "absolute inset-y-0 left-0 rounded-full",
          tone === "fg" && "bg-fg",
          tone === "accent" && "bg-accent",
          tone === "muted" && "bg-muted",
          smooth ? "transition-[width] duration-1000 ease-linear" : "transition-[width] duration-700 ease-out-soft",
        )}
        style={{ width: `${pct}%` }}
      />
      {marker !== undefined && (
        <div
          className="absolute -bottom-1 -top-1 w-[2px] -translate-x-1/2 rounded-full bg-muted transition-[left] duration-1000 ease-linear"
          style={{ left: `${clamp(marker, 0, 1) * 100}%` }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[92dvh] overflow-y-auto overscroll-contain px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-3 sm:px-7 sm:pb-7 sm:pt-6">
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-faint sm:hidden" aria-hidden="true" />
        {title !== undefined && (
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="font-serif text-[26px] leading-tight tracking-[-0.01em]">{title}</h2>
            <IconButton label="Close" onClick={onClose} className="-mr-2">
              <CloseIcon />
            </IconButton>
          </div>
        )}
        {children}
      </div>
    </dialog>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label-caps">{label}</span>
      <div className="mt-2">{children}</div>
      {hint && <div className="mt-1.5 text-xs text-muted">{hint}</div>}
    </label>
  );
}

export const inputClass =
  "h-12 w-full rounded-2xl bg-surface-2 px-4 text-[15px] text-fg outline-none ring-1 ring-transparent transition placeholder:text-muted focus:ring-line-strong";

export function SettingRow({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="min-w-0">
        <div className="text-[15px] font-medium tracking-[-0.01em]">{title}</div>
        {description && <div className="mt-0.5 text-[13px] leading-snug text-muted">{description}</div>}
      </div>
      {children}
    </div>
  );
}

export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <header className="mb-7 flex items-end justify-between gap-4 pt-2 sm:mb-9">
      <h1 className="font-serif text-[38px] leading-none tracking-[-0.02em] sm:text-[44px]">{title}</h1>
      {action}
    </header>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cx(
        "inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-line-strong bg-surface-2 px-1.5 font-sans text-[11px] font-medium text-fg-2",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/**
 * Shows its children only where a keyboard is likely: wide screens with a mouse
 * or trackpad. Owns the display property itself, so children keep their own.
 */
export function IfKeyboard({ children }: { children: ReactNode }) {
  return <span className="hidden sm:pointer-fine:contents">{children}</span>;
}
