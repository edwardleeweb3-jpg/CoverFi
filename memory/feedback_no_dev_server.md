---
name: feedback_no_dev_server
description: Do not start the Next.js dev server yourself — the user always has one running in their own terminal.
metadata:
  type: feedback
---

Do not run `npm run dev` (or any equivalent dev-server start command) yourself. The user keeps a dev server running in a separate terminal at all times.

**Why:** Stated directly by the user during step 1 of the CoverFi frontend rebuild — they refreshes localhost:3000 in their own browser to verify each step. Starting a parallel dev server wastes their time and the harness's permission prompts.

**How to apply:**
- Make file edits, then tell the user "改完了,刷新一下验收" (or equivalent). Don't `npm run dev`.
- It's still fine to run one-shot checks if genuinely needed: `npm run build` for type errors, `npm run lint`, `tsc --noEmit`. But not the dev server.
- If a diagnosis genuinely requires inspecting the running server output (e.g., a runtime stack trace the user can't read), ask the user to paste it rather than spinning up a parallel server.
