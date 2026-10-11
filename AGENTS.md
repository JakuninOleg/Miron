# MIRON agent rules

Read `docs/architecture.md`, `src/shared/contracts.ts`, and the files needed for your task. Current product: MIRON, adult everyday fitness companion, Max/Lika, Russian UI, Next/React/TypeScript, PostgreSQL/Drizzle, PWA. No landing page in this iteration. No SMS. Email/password + Yandex/VK through Better Auth. Qwen is not connected yet.

- Root owns package/config/shared contracts and integration. One owner per file; report required contract changes before editing another owner's files.
- Strict TypeScript; no `any`, blanket lint suppression, secrets in client code, fake successful API actions, hardcoded production credentials or global mutable user state.
- Server authorizes every private query/command. Validate inputs, bound payloads, transactions and retries. Use parameterized SQL. Idempotency is required for workout commands and trial use.
- UI is Russian, accessible, responsive, keyboard usable, reduced-motion aware. Theme/persona/gender are independent; lighter options follow ability and user preference.
- Demo content is explicitly demo/draft. Generated illustrations are not expert-verified technique. Do not publish draft data as approved training.
- Cache public catalog separately from private account data. Logout detaches the active owner and clears confirmed private cache; retain an owner's unsynced journal until that same owner authenticates again. Never display or send another owner's queue. Never cache auth routes or API responses in a generic service worker cache.
- Use domain modules, small React components, direct imports. Avoid needless framework layers and copy-pasted mock UI. Follow Vercel React performance guidance.
- Tests should exercise access, concurrency, idempotency, offline persistence and critical paths. Run typecheck, lint, tests and build for substantial implementation.
- Do not deploy, publish, create payments, install system services, alter unrelated user data or send messages without user authorization. Current user authorized local dependencies/tools and developer OAuth setup.
- Deliver files changed, commands/checks run, concrete limitations. Do not claim production readiness or thousands of concurrent users without measurements.

## graphify

When the user types `/graphify`, read the installed graphify skill before doing anything else.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
