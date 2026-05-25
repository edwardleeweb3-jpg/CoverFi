import { en } from "./en";
import { zh } from "./zh";
import type { Dict, Lang } from "./types";

export { en, zh };
export type { Dict, Lang };

export const dictionaries: Record<Lang, Dict> = { en, zh };
