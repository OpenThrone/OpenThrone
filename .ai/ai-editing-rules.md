# AI Editing Rules — OpenThrone

> Rules for AI-assisted code changes. Follow these BEFORE generating any patch.

---

## Pre-Edit Checklist

Before editing ANY file, the AI must:

1. **Identify the target** — What function/component/type/route is being changed?
2. **Find the definition** — Where is it defined?
3. **Find all imports** — Who imports it? Check barrel exports.
4. **Find all call sites** — Where is it used? (JSX, function calls, type references)
5. **Find related types** — What types/interfaces/schemas does it touch?
6. **Find related tests** — What tests cover this code?
7. **Assess blast radius** — How many files need changes?

---

## Impact Analysis Template

Before generating a patch, produce this:

```markdown
## Impact Analysis

### Target Change
[Description of requested change]

### Primary Target
- Name: [symbol name]
- Kind: [function | component | type | route | API handler]
- Defined in: [file path]

### Directly Affected Files
- `path/to/file.ts` — [why affected]

### Indirectly Affected Files
- `path/to/file.tsx` — [why may be affected]

### Files That Must Change
1. `path/to/file.ts`

### Files That Need Verification Only
1. `path/to/other-file.ts`

### Validation Commands
bun run check-types
bun run lint
bun test
bun run map:unused
bun run map:circular
```

---

## Search Commands

### Find definitions
```bash
rg "export function functionName" src/
rg "export const functionName" src/
rg "interface FunctionName" src/
rg "type FunctionName" src/
```

### Find imports
```bash
rg "import.*functionName" src/
rg "import.*ComponentName" src/
rg "from.*ComponentName" src/
```

### Find call sites
```bash
rg "functionName\(" src/
rg "<ComponentName" src/
rg ": TypeName" src/
```

### Find barrel exports
```bash
rg "export \* from" src/
rg "export.*functionName" src/
```

### Find tests
```bash
rg "functionName" src/ --glob "*.test.*"
rg "ComponentName" src/ --glob "*.test.*"
```

---

## Architecture Rules

### Service Layer
- ALL business logic lives in `src/services/*.service.ts`
- API handlers (`src/pages/api/`) are thin wrappers calling services
- Services use Prisma client from `src/lib/prisma.ts`
- Services are barrel-exported from `src/services/index.ts`

### Component Layer
- Use **Mantine primitives** when available (Modal, Button, TextInput, etc.)
- Never recreate UI primitives from scratch
- Follow race theme system via `src/styles/themes.tsx`
- New components use PascalCase naming

### Route Layer
- Pages Router pattern (`src/pages/`)
- Dynamic routes use `[param]` syntax
- API handlers export `default async function handler(req, res)`
- Auth checks via `src/middleware/auth.ts` or inline session checks

### Styling
- Order: Mantine theme → Tailwind utilities → global.css → CSS Modules
- No hardcoded colors — use theme tokens or race CSS variables
- RPG aesthetic: use `OrnatePanel`, `themedCard`, game components

---

## Edit Rules

### MUST DO
- Update ALL affected call sites when changing a function signature
- Update ALL parent components when changing component props
- Update types/interfaces BEFORE implementation
- Update tests when behavior changes
- Remove dead imports, exports, and stale code
- Follow existing codebase patterns (naming, structure, imports)
- Use `@/` path alias for local imports
- Sort imports: React/Next → third-party → local

### MUST NOT DO
- Use `as any`, `@ts-ignore`, `@ts-expect-error`
- Leave empty catch blocks
- Delete failing tests to make suite pass
- Introduce new UI primitives when Mantine provides them
- Hardcode colors outside of theme files
- Create new barrel export files without updating existing ones
- Use `default` exports inconsistently (match existing pattern in the file)

### DEPENDENCY CHANGES
- Adding a dependency requires justification
- Prefer existing libraries over new packages
- Never install alternative package managers (use bun)
- Run `bun install` after package.json changes

---

## Post-Edit Validation

After every change, run:

```bash
bun run check-types    # Must pass
bun run lint           # Must pass (new warnings from your changes only)
bun test               # Must pass (existing + relevant tests)
bun run map:unused     # Check for newly dead code
bun run map:circular   # Check for new circular deps
```

---

## Common Pitfalls

1. **Forgetting barrel exports** — If you rename/remove an export from a service, update `src/services/index.ts`
2. **Missing API handler updates** — Service signature changes must propagate to all API routes using it
3. **Theme-blindness** — Changes must work across all 4 race themes (ELF, HUMAN, UNDEAD, GOBLIN)
4. **i18n strings** — User-facing text should use `next-i18next`, not hardcoded strings
5. **Permission checks** — New admin/moderation endpoints must use `src/middleware/apiGuard.ts`
6. **Socket events** — Real-time features need both server (`src/lib/socket.ts`) and client updates
