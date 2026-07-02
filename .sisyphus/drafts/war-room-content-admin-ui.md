# Draft: War Room Content Admin UI

## Requirements (confirmed)
- "look at the War Room Intelligence and the admin funcitons for adding news/blogposts (as well as advisor statements to the sidebar)"
- "The front end needs to be clean and make sense, and look like it fits into the game-centric atmosphere of Openthrone."
- "Similarly, the UI for the admin pages to write these things needs to make sense."

## Technical Decisions
- Planning only: no source code edits in this session.
- Existing Mantine + GameCard + AdminLayout patterns should be reused; no new UI framework.
- Treat as Standard-to-Architecture UI work because it touches public news/War Room, admin content workflow, sidebar advisor data, API/data shape, and verification.
- Advisor sidebar statements will be admin-managed, not only hard-coded constants.
- `/administration/blog` rich editor ideas will be merged into `/home/admin/content`, making `/home/admin/content` the canonical staff content workspace.
- News/blogposts will use a full content workflow: list, create, edit, publish/archive, preview, pin, kind filters, and clean War Room display.
- Test strategy: tests-after, plus lint/typecheck and agent-executed browser QA.

## Research Findings
- `src/components/game/StyledNews.tsx`: War Room Intelligence widget is a compact GameCard wrapping a Mantine Accordion with inline dark styles and `read` badge.
- `src/pages/home/overview.tsx`: uses `StyledNews` with `/api/blog/getRecentPosts`, so the War Room widget is surfaced on home overview.
- `src/pages/community/news/index.tsx` and `[id].tsx`: public news pages use `BlogPost`, `GameCard`, Markdown rendering, read-status updates, and an inline admin-only create modal gated by `userId === 1`.
- `src/pages/home/admin/content.tsx`: current admin content management page uses AdminLayout, Mantine Table/Modal/forms, `/api/admin/content/posts`, status/kind/pinned fields, but has minimal atmosphere and no rich preview/editor structure.
- `src/pages/administration/blog.tsx`: older rich-text/blog editor uses Mantine Tiptap and Markdown preview but appears disconnected from admin layout and only logs submitted content.
- `src/hooks/useSidebarData.ts`: advisor messages are hard-coded in `ADVISOR_MESSAGES`, rotate every 15s, and are rendered by `src/components/Sidebar.tsx` in mobile and desktop variants.
- Test setup: `package.json` exposes `bun run lint`, `bun run check-types`, `bun test`; Jest/testing-library files exist, Cypress scripts exist for browser QA.
- `prisma/schema.prisma:482-500`: `blog_posts` already has `slug`, `status`, `kind`, `excerpt`, `publishedAt`, and `isPinned`, so the plan can use existing fields for full news/blog/changelog workflow.
- `src/pages/api/admin/content/posts.ts`: admin posts API currently supports GET/POST only; full workflow requires item-level update/archive/delete or soft-delete endpoints.

## Open Questions
- None blocking for plan generation.

## Scope Boundaries
- INCLUDE: War Room Intelligence display, public news/blog post presentation where it shares the same content system, admin content authoring UI, advisor statement display/admin flow planning.
- EXCLUDE: Implementing source changes in this Prometheus session.
