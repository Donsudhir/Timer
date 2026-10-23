"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useApp, type BookInput } from "@/lib/store";
import type { Book } from "@/lib/types";
import { BookIcon, CheckIcon, PlusIcon, TimerIcon } from "./icons";
import { Bar, Button, Field, Sheet, cx, inputClass } from "./ui";

export const bookProgress = (b: Book) => Math.min(1, (b.currentPage - 1) / b.totalPages);
export const isFinished = (b: Book) => b.currentPage > b.totalPages;

export function BookForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Book;
  submitLabel: string;
  onSubmit: (input: BookInput) => void;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [author, setAuthor] = useState(initial?.author ?? "");
  const [total, setTotal] = useState(initial ? String(initial.totalPages) : "");
  const [current, setCurrent] = useState(initial ? String(initial.currentPage) : "1");

  const totalNum = Number(total);
  const currentNum = Number(current);
  const totalValid = Number.isInteger(totalNum) && totalNum >= 1 && totalNum <= 100000;
  const currentValid = Number.isInteger(currentNum) && currentNum >= 1 && (!totalValid || currentNum <= totalNum + 1);
  const valid = title.trim().length > 0 && totalValid && currentValid;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSubmit({ title, author, totalPages: totalNum, currentPage: currentNum });
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <Field label="Title">
        <input
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Book, chapter, or notes"
          autoFocus={!initial}
          required
          maxLength={160}
        />
      </Field>
      <Field label="Author">
        <input
          className={inputClass}
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="Optional"
          maxLength={120}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Total pages">
          <input
            className={cx(inputClass, "tabular")}
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            inputMode="numeric"
            type="number"
            min={1}
            placeholder="320"
            required
          />
        </Field>
        <Field label={initial ? "Current page" : "Start at page"}>
          <input
            className={cx(inputClass, "tabular", !currentValid && current !== "" && "ring-behind/50")}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            inputMode="numeric"
            type="number"
            min={1}
            required
          />
        </Field>
      </div>
      <div className="flex gap-3 pt-1">
        {onCancel && (
          <Button variant="secondary" size="lg" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="lg" className="flex-1" disabled={!valid}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** Choose what to read: a library book, a new one, or no book at all. */
export function BookPickerSheet({
  open,
  onClose,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const books = useApp((s) => s.books);
  const addBook = useApp((s) => s.addBook);
  const [adding, setAdding] = useState(false);
  const showForm = adding || books.length === 0;

  const choose = (id: string | null) => {
    onSelect(id);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={() => {
        setAdding(false);
        onClose();
      }}
      title={showForm ? "New book" : "What are you reading?"}
    >
      {showForm ? (
        <BookForm
          key={String(open)}
          submitLabel="Add and select"
          onCancel={books.length ? () => setAdding(false) : undefined}
          onSubmit={(input) => {
            const id = addBook(input);
            setAdding(false);
            choose(id);
          }}
        />
      ) : (
        <div className="space-y-1.5">
          {books.map((b) => (
            <PickerRow
              key={b.id}
              selected={b.id === selectedId}
              onClick={() => choose(b.id)}
              icon={<BookIcon size={18} />}
              title={b.title}
              subtitle={
                isFinished(b) ? "Finished" : `p. ${b.currentPage} of ${b.totalPages}${b.author ? ` · ${b.author}` : ""}`
              }
              progress={bookProgress(b)}
            />
          ))}
          <PickerRow
            selected={selectedId === null}
            onClick={() => choose(null)}
            icon={<TimerIcon size={18} />}
            title="No book"
            subtitle="A quick session for notes or loose pages"
          />
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-2 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] font-medium text-fg-2 transition hover:bg-surface-2 hover:text-fg"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-line-strong">
              <PlusIcon size={18} />
            </span>
            Add a book
          </button>
        </div>
      )}
    </Sheet>
  );
}

function PickerRow({
  selected,
  onClick,
  icon,
  title,
  subtitle,
  progress,
}: {
  selected: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  subtitle: string;
  progress?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition",
        selected ? "bg-surface-2" : "hover:bg-surface-2/60",
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-2">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-serif text-[17px] leading-tight">{title}</span>
        <span className="mt-0.5 block truncate text-[13px] text-muted">{subtitle}</span>
        {progress !== undefined && <Bar value={progress} className="mt-2 h-[3px]" tone="muted" />}
      </span>
      <span className={cx("shrink-0 text-fg transition-opacity", selected ? "opacity-100" : "opacity-0")}>
        <CheckIcon size={18} />
      </span>
    </button>
  );
}
