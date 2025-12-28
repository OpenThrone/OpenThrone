---
trigger: always_on
---

# Agent Guidelines for OpenThrone

## Build/Lint/Test Commands

- **Package Manager**: Use Bun for all package management
- **Build**: `bun run build` or `next build`
- **Lint**: `bun run lint` or `next lint`
- **Format**: `bun run format` (includes Prettier)
- **Type Check**: `bun run check-types` (TypeScript)
- **Test Suite**: `bun test` or `jest`
- **Single Test**: `bun test <path/to/test-file>`

## Code Style Guidelines

### General

- Use TypeScript with strict mode disabled (`"strict": false`)
- Follow Next.js conventions and file structure
- Use path aliases: `@/` maps to `./src/`
- No unused variables/parameters (TypeScript config has these disabled)
- Use Prettier for consistent formatting

### Naming Conventions

- **Components**: PascalCase (e.g., `AlertComponent`)
- **Functions/Methods**: camelCase (e.g., `showAlert`)
- **Interfaces/Types**: PascalCase (e.g., `AlertType`)
- **Files**: kebab-case for components, camelCase for utilities
- **Constants**: UPPER_SNAKE_CASE

### Imports

- Group imports: React/Next, third-party libraries, local imports
- Use absolute imports with `@/` alias
- Sort imports with eslint-plugin-simple-import-sort
- Type imports use `import type` syntax

### React/TypeScript Patterns

- Use functional components with hooks
- Explicitly type props with interfaces
- Use `React.FC` sparingly, prefer explicit typing
- Handle async operations with proper error handling
- Use RxJS BehaviorSubject for reactive state in services

### Error Handling

- Use try/catch blocks for async operations
- Log errors with the logger utility (`@/utils/logger`)
- Return null/undefined for missing data rather than throwing
- Use optional chaining (`?.`) and nullish coalescing (`??`)

### Testing

- Use Bun test framework with Vitest (`vi`)
- Mock Prisma and random functions in tests
- Use descriptive test names with `describe`/`it`
- Reset mocks between tests with `beforeEach`

### UI/UX

- Use Mantine components for consistent UI
- Follow existing component patterns (ContentCard, etc.)
- Use FontAwesome icons via react-fontawesome
- Implement proper loading states and error boundaries
