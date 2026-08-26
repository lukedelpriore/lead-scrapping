# Project rules
- This is Del Priore Hospitality's Lead Engine. Never mention any other company in code, comments, UI, emails, or commits.
- Spec of record: DPH_Lead_Engine_Build_Spec.md. Build M0 to M6 continuously. Only pause for the hard stops in Section 2.
- REVEAL_MODE stays "off" for the entire build. Never call RocketReach person lookup, bulk lookup, company lookup, or profile-company lookup. Account, person search, company search, and status polling are free and allowed.
- No em dashes or en dashes anywhere, including UI copy, comments, and docs. No hyphenated compound adjectives in prose.
- Secrets come from env only. Never print, log, or commit them.
- TypeScript strict. Zod at every boundary. Tests for every normalizer and dedupe key.
- Record every judgement call in DECISIONS.md and keep building. Do not ask for approval on naming, libraries, file layout, or design details.

## Layout
- apps/web        Next.js 15 App Router portal
- apps/worker     Node 22 pg-boss worker
- packages/pipeline  stage implementations, adapters, normalizers
- packages/db     Prisma schema, migrations, seed
- packages/config Zod validated env and settings

## Commands
- pnpm install
- pnpm db:migrate && pnpm db:seed
- pnpm dev        web on 3000
- pnpm worker
- pnpm test
