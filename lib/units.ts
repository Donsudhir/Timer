import { plural } from "./format";
import type { SessionMode } from "./types";

/** What a session counts, in the words each screen needs. */
export interface Units {
  one: string;
  many: string;
  One: string;
  Many: string;
  /** Compact reference such as "p. 42" or "Q12". */
  ref: (n: number) => string;
  next: string;
  count: (n: number) => string;
}

const PAGES: Units = {
  one: "page",
  many: "pages",
  One: "Page",
  Many: "Pages",
  ref: (n) => `p. ${n}`,
  next: "Next page",
  count: (n) => plural(n, "page"),
};

const QUESTIONS: Units = {
  one: "question",
  many: "questions",
  One: "Question",
  Many: "Questions",
  ref: (n) => `Q${n}`,
  next: "Next question",
  count: (n) => plural(n, "question"),
};

export const unitsFor = (mode: SessionMode | undefined): Units =>
  mode === "practice" ? QUESTIONS : PAGES;
