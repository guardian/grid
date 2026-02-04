# Copilot Instructions for newui

## Project Overview

**newui** is a React-based Single Page Application (SPA) built with:
- **React 19** with TypeScript strict mode
- **TanStack Router** v1 for file-based routing (auto-generated from `src/routes/`)
- **Vite 7** for fast build tooling with automatic code-splitting
- **Tailwind CSS 4** for styling via `@tailwindcss/vite`
- **Vitest** for unit testing with React Testing Library

The app bootstraps in `src/main.tsx`, registers routes from `src/routeTree.gen` (auto-generated), and uses context-free routing with strict type safety via TypeScript module augmentation.

## Architecture Patterns

### File-Based Routing
- Routes are defined as files in `src/routes/` (e.g., `src/routes/index.tsx` → `/`, `src/routes/about.tsx` → `/about`)
- Root layout in `src/routes/__root.tsx` wraps all routes with `<Outlet />`
- TanStack Router plugin auto-generates `src/routeTree.gen.ts` (never edit manually)
- **Navigation**: Always use `<Link to="/path">` from `@tanstack/react-router` for SPA routing, not `<a>` tags

### Component Structure
- Functional components with hooks required (no class components)
- Header component (`src/components/Header.tsx`) is a good reference for state management patterns
- Use lucide-react icons (e.g., `Menu`, `X`, `Home`) for consistent iconography

### Styling Convention
- **Tailwind CSS classes only** in `className` attributes (no inline CSS)
- Reference: Header component uses Tailwind patterns like `flex items-center`, `hover:bg-gray-700`, `transition-colors`
- Color scheme: grays (gray-800 for primary, gray-900 for dark backgrounds)
- Responsive design with Tailwind's responsive prefixes (e.g., `md:`, `lg:`)

## Development Workflow

### Commands
- `npm run dev` — Start dev server on port 3000 (Vite with HMR)
- `npm run build` — Build for production + type-check with tsc (no emit, strict validation)
- `npm run test` — Run Vitest tests (watch mode disabled, run once)
- `npm run lint` — Run ESLint (TanStack config) to check code
- `npm run format` — Run Prettier (check mode)
- `npm run check` — Format + lint with auto-fix (combined safety check)

### Build Output
- Vite outputs to `dist/` (conventional)
- Build includes automatic code-splitting for route components
- Type checking is separate from Vite build (via `tsc` after build succeeds)

## TypeScript & Tooling

### Key Compiler Options
- **strict: true** — Full strict type checking enforced
- **noUnusedLocals/noUnusedParameters: true** — Unused code must be removed
- **noFallthroughCasesInSwitch: true** — Exhaustive switch statements required
- **jsx: react-jsx** — No React import needed in JSX files
- **@/* paths** — `src/*` imports use `@/` alias (e.g., `import Header from '@/components/Header'`)

### ESLint & Prettier
- ESLint uses [@tanstack/eslint-config](https://tanstack.com/config/latest/docs/eslint) (extends React & TypeScript rules)
- Prettier config in `prettier.config.js` (standard formatting)
- Run `npm run check` before committing to auto-fix issues

## Integration Points & DevTools

### TanStack Devtools
- **Router Devtools** (bottom-right panel): Shows route tree, navigation state, loader timing
- **React Devtools**: Component tree inspection, state/hook tracking
- Both render in `src/routes/__root.tsx`; disable them in production builds

### Router Configuration
- `defaultPreload: 'intent'` — Preload routes on link hover (performance)
- `scrollRestoration: true` — Restore scroll position on back navigation
- `defaultStructuralSharing: true` — Prevent unnecessary re-renders via structural equality

## Common Patterns & Conventions

### Adding a New Route
1. Create file in `src/routes/` (e.g., `src/routes/about.tsx`)
2. Export `Route` object: `export const Route = createFileRoute('/about')({ component: About })`
3. Plugin auto-generates `routeTree.gen.ts` on save — no manual registration needed

### Creating Components
- Use default export if file represents one component (e.g., `export default function Header()`)
- Import icons from `lucide-react` as needed
- Use Tailwind for all styling; no CSS modules or inline styles

### Testing
- Import `@testing-library/react` for component tests
- Use `vitest` syntax (compatible with Jest)
- Test components in isolation using rendered elements from `render()`

## Project-Specific Notes

- **No context in Router**: App initializes `context: {}` in `main.tsx` — add global state via hooks or context providers if needed
- **Structural Sharing**: Enabled by default to minimize re-renders during navigation
- **Auto Code-Splitting**: Vite + Router plugin automatically splits route components into separate bundles
- **Port 3000**: Dev server runs on port 3000 (configured in Vite, not default 5173)

## References

- [TanStack Router Docs](https://tanstack.com/router/latest)
- [Tailwind CSS](https://tailwindcss.com/)
- [Vite Docs](https://vitejs.dev/)
- [TypeScript Strict Mode](https://www.typescriptlang.org/tsconfig#strict)
