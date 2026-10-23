"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDuration, formatPace, formatRelativeDay, plural } from "@/lib/format";
import { forBook, totals } from "@/lib/stats";
import { useApp } from "@/lib/store";
import type { Book } from "@/lib/types";
import { BookForm, bookProgress, isFinished } from "../books";
import { PageColumn } from "../Hydrated";
import { BookIcon, PlayIcon, PlusIcon } from "../icons";
import { Bar, Button, PageHeader, Sheet } from "../ui";

const recency = (b: Book) => b.lastReadAt ?? b.createdAt;

export function LibraryScreen() {
  const books = useApp((s) => s.books);
  const addBook = useApp((s) => s.addBook);
  const [addOpen, setAddOpen] = useState(false);
  const [addKey, setAddKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const reading = books.filter((b) => !isFinished(b)).sort((a, b) => recency(b) - recency(a));
  const finished = books.filter(isFinished).sort((a, b) => recency(b) - recency(a));

  const openAdd = () => {
    setAddKey((k) => k + 1);
    setAddOpen(true);
  };
  const openBook = (id: string) => {
    setSelectedId(id);
    setDetailOpen(true);
  };

  return (
    <PageColumn>
      <PageHeader
        title="Library"
        action={
          books.length > 0 && (
            <Button size="sm" variant="secondary" onClick={openAdd}>
              <PlusIcon size={16} /> Add
            </Button>
          )
        }
      />

      {books.length === 0 ? (
        <div className="flex flex-col items-center rounded-[28px] border border-dashed border-line-strong px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-fg-2">
            <BookIcon size={24} />
          </div>
          <h2 className="mt-5 font-serif text-2xl">Nothing on the shelf yet</h2>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">
            Add a book, a chapter, or a stack of notes. PagePace keeps your place and your pace.
          </p>
          <Button className="mt-7" onClick={openAdd}>
            <PlusIcon size={16} /> Add a book
          </Button>
        </div>
      ) : (
        <div className="space-y-10">
          {reading.length > 0 && <Shelf title="Reading" books={reading} onOpen={openBook} />}
          {finished.length > 0 && <Shelf title="Finished" books={finished} onOpen={openBook} />}
        </div>
      )}

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="New book">
        <BookForm
          key={addKey}
          submitLabel="Add book"
          onSubmit={(input) => {
            addBook(input);
            setAddOpen(false);
          }}
        />
      </Sheet>

      <BookDetailSheet bookId={selectedId} open={detailOpen} onClose={() => setDetailOpen(false)} />
    </PageColumn>
  );
}

function Shelf({ title, books, onOpen }: { title: string; books: Book[]; onOpen: (id: string) => void }) {
  return (
    <section>
      <h2 className="label-caps mb-3">
        {title} · {books.length}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {books.map((b) => (
          <BookCard key={b.id} book={b} onClick={() => onOpen(b.id)} />
        ))}
      </div>
    </section>
  );
}

function BookCard({ book, onClick }: { book: Book; onClick: () => void }) {
  const pct = Math.round(bookProgress(book) * 100);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col rounded-[24px] bg-surface p-5 text-left shadow-soft ring-1 ring-line transition duration-300 hover:-translate-y-0.5 active:scale-[0.99]"
    >
      <div className="flex w-full items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="line-clamp-2 font-serif text-[21px] leading-[1.15] tracking-[-0.01em]">{book.title}</div>
          {book.author && <div className="mt-1 truncate text-[13px] text-muted">{book.author}</div>}
        </div>
        <div className="shrink-0 pt-1 text-[13px] font-medium text-fg-2 tabular">{pct}%</div>
      </div>
      <div className="mt-auto w-full pt-5">
        <Bar value={bookProgress(book)} tone="accent" />
        <div className="mt-3 flex justify-between gap-2 text-xs text-muted">
          <span className="tabular">
            {isFinished(book) ? `${book.totalPages} pages` : `p. ${book.currentPage} of ${book.totalPages}`}
          </span>
          <span>{book.lastReadAt ? formatRelativeDay(book.lastReadAt) : "Not started"}</span>
        </div>
      </div>
    </button>
  );
}

function BookDetailSheet({
  bookId,
  open,
  onClose,
}: {
  bookId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const book = useApp((s) => s.books.find((b) => b.id === bookId));
  const history = useApp((s) => s.history);
  const liveStatus = useApp((s) => s.active?.status);
  const { updateBook, deleteBook, updateSetup } = useApp.getState();
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");

  const close = () => {
    onClose();
    setMode("view");
  };

  if (!book) return <Sheet open={false} onClose={close}>{null}</Sheet>;

  const records = forBook(history, book.id);
  const t = totals(records);
  const pagesLeft = Math.max(0, book.totalPages - book.currentPage + 1);
  const pct = Math.round(bookProgress(book) * 100);
  const liveSession = liveStatus === "running" || liveStatus === "paused";

  const readNow = () => {
    if (!liveSession) updateSetup({ bookId: book.id });
    close();
    router.push("/");
  };

  return (
    <Sheet open={open} onClose={close} title={mode === "edit" ? "Edit book" : book.title}>
      {mode === "edit" ? (
        <BookForm
          initial={book}
          submitLabel="Save"
          onCancel={() => setMode("view")}
          onSubmit={(input) => {
            updateBook(book.id, {
              title: input.title.trim(),
              author: input.author?.trim() || undefined,
              totalPages: input.totalPages,
              currentPage: input.currentPage ?? book.currentPage,
            });
            setMode("view");
          }}
        />
      ) : (
        <>
          {book.author && <p className="-mt-3 mb-5 text-sm text-muted">{book.author}</p>}

          <div className="flex items-end justify-between gap-4">
            <div className="text-[52px] font-extralight leading-none tracking-[-0.04em] tabular">{pct}%</div>
            <div className="pb-1 text-right text-[13px] leading-snug text-muted">
              {isFinished(book) ? "Finished" : `p. ${book.currentPage} of ${book.totalPages}`}
              <br />
              {pagesLeft > 0 ? `${plural(pagesLeft, "page")} left` : "Every page read"}
            </div>
          </div>
          <Bar value={bookProgress(book)} tone="accent" className="mt-4" />

          <div className="mt-6 grid grid-cols-3 divide-x divide-line rounded-2xl bg-surface-2/70 py-4 text-center">
            <MiniStat label="Read here" value={String(t.pages)} />
            <MiniStat label="Time" value={t.ms ? formatDuration(t.ms) : "—"} />
            <MiniStat label="Per page" value={t.paceMs ? formatPace(t.paceMs) : "—"} />
          </div>

          {t.paceMs && pagesLeft > 0 && (
            <p className="mt-3 text-center text-[13px] text-muted">
              At your pace, about {formatDuration(pagesLeft * t.paceMs)} to finish.
            </p>
          )}

          <Button size="lg" className="mt-6 w-full" onClick={readNow}>
            <PlayIcon size={17} />
            {liveSession ? "Back to session" : isFinished(book) ? "Read again" : "Read now"}
          </Button>

          {records.length > 0 && (
            <div className="mt-7">
              <h3 className="label-caps mb-1">Recent sessions</h3>
              <ul className="divide-y divide-line">
                {records.slice(0, 5).map((r) => (
                  <li key={r.id} className="flex items-baseline justify-between gap-3 py-3 text-sm">
                    <span className="text-fg-2">{formatRelativeDay(r.startedAt)}</span>
                    <span className="text-muted tabular">
                      {plural(r.pageTimes.length, "page")} · {formatDuration(r.activeMs)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {mode === "delete" ? (
            <div className="mt-6 animate-fade rounded-2xl bg-behind/10 p-4">
              <p className="text-[13px] leading-snug text-fg-2">
                Delete this book? Its sessions stay in your stats.
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="secondary" className="flex-1" onClick={() => setMode("view")}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  className="flex-1"
                  onClick={() => {
                    close();
                    deleteBook(book.id);
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-6 flex gap-2 border-t border-line pt-4">
              <Button variant="ghost" size="sm" className="flex-1" onClick={() => setMode("edit")}>
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 text-behind hover:text-behind"
                onClick={() => setMode("delete")}
              >
                Delete
              </Button>
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2">
      <div className="label-caps">{label}</div>
      <div className="mt-1 text-lg font-light tracking-[-0.02em] tabular">{value}</div>
    </div>
  );
}
