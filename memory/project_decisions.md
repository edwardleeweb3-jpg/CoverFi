---
name: project_decisions
description: CoverFi phase-1 architectural decisions confirmed by user before frontend rebuild
metadata:
  type: project
---

Three decisions confirmed before starting the prototype-to-Next.js rebuild:

1. **State management = Zustand** (chosen over plain React Context).
   **Why:** Closest mental model to the prototype's single `state` object; tiny API; user explicitly picked it.
   **How to apply:** Wallet, language, theme, list filters/search/sort, ephemeral UI state all go in Zustand stores under `src/stores/` (or similar). Don't reach for Context unless there's a concrete reason Zustand can't serve.

2. **Currency display = USDC literal for now.**
   **Why:** PRD §1.3 says BSC Testnet uses BNB testnet tokens, but the prototype shows everything as USDC and the user wants visual fidelity first. Real unit handling lands when contracts are wired in.
   **How to apply:** Don't insert BNB / token-address machinery now. Display amounts with the "USDC" suffix exactly as prototype does. Mark this with a TODO when we touch contract integration so we don't forget to revisit.

3. **Admin backend (PRD §4A) deferred.**
   **Why:** User-facing main flow (insurance → review → policies → policy detail) is P0 per PRD §10. Admin is P1 and adds ~2–3h scope per PRD §9.5. User explicitly said skip it until main flow is fully working.
   **How to apply:** Don't scaffold `/admin/*` routes, admin APIs, or auth gating yet. BUT: still read pricing `Q` from a single config module (`lib/config.ts`) so the later swap to `/api/admin/config` is a one-line change — PRD §4A.6 explicitly warns against hardcoding `Q`.

See also [[step_progression]] for the agreed step-by-step build order (the user wants one step at a time, stop and wait for verification).
