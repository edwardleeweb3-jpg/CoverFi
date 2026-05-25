---
name: step_progression
description: CoverFi rebuild is one-step-at-a-time. Do exactly one step, stop, wait for user verification, then continue.
metadata:
  type: feedback
---

User wants the prototype-to-Next.js rebuild executed strictly one step at a time.

**Why:** They've laid out an 11-step plan (see _docs/PRD.md context and the analysis from the planning conversation) and want to verify each step in-browser before moving on. Batching steps blocks early feedback and risks compounding mistakes.

**How to apply:**
- Do exactly ONE step per turn. Stop. Do not start the next step in the same turn.
- After finishing, give the user a one-sentence summary of what was done and a one-sentence "how to verify in browser" line.
- Wait for explicit confirmation ("ok", "verified", "next") before moving on.
- If the user asks a question mid-step, answer it but don't auto-advance.

Tracked plan (see [[project_decisions]] for related architecture choices):
1. Foundation & design tokens (CSS vars, Tailwind bridge, fonts, brand SVG defs, theme bootstrap)
2. Providers & UI primitives (Locale, Theme, Wallet mock, Toast; Button/Badge/Chip/Icon/Card/Skeleton/Spinner)
3. Site shell (SiteHeader, MobileDrawer, SiteFooter)
4. Home page (`/`)
5. Wallet flow (simulated)
6. Mock data + pricing/release helpers
7. `/insurance` list
8. `/insurance/review/[orderId]`
9. `/policies`
10. `/policies/[policyId]`
11. Responsive QA + polish

Currency stays "USDC" literal; admin backend (§4A) deferred — see [[project_decisions]].
