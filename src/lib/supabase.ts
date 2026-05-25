import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client — used by API routes / server actions / future
 * data-fetch hooks to read & write the `markets` / `policies` /
 * `activities` / `config` tables (PRD §5).
 *
 * Auth note: CoverFi does NOT use Supabase Auth. User identity is the
 * wallet address (recovered from a signed message at the API layer),
 * so we only need the basic browser/server client — no SSR cookie
 * helpers, no `@supabase/ssr`.
 *
 * Both env vars are public on purpose: the `NEXT_PUBLIC_*` prefix
 * inlines them into the client bundle, and the publishable key is
 * already designed to be safely shipped to browsers (RLS gates real
 * access at the table level). Service-role keys, if ever needed, must
 * stay server-only and unprefixed.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url) {
  throw new Error(
    "[supabase] NEXT_PUBLIC_SUPABASE_URL is not set. Add it to .env.local " +
      "(see CLAUDE.md §8 — Segment 3 setup).",
  );
}
if (!key) {
  throw new Error(
    "[supabase] NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set. Add it to " +
      ".env.local (see CLAUDE.md §8 — Segment 3 setup).",
  );
}

export const supabase: SupabaseClient = createClient(url, key);
