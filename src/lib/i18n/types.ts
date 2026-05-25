import { en } from "./en";

/** Canonical dictionary shape. `en` is the source of truth; `zh` must match it. */
export type Dict = typeof en;

export type Lang = "en" | "zh";
