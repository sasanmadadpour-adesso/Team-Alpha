# UI design system (Tailwind CSS v4 + shadcn/ui)

The UI is built on **Tailwind CSS v4** and **shadcn/ui** (Radix primitives). This replaces the earlier hand-written stylesheet and the unused UI5 packages. It is a deliberate decision of the product owner; `AGENTS.md` originally listed Tailwind/shadcn as out of scope.

## Layers

| Layer | Where | Rule |
| --- | --- | --- |
| Tokens | `app/src/index.css` | One source for color, radius, shadow, motion. Primary = Deep Ocean Blue `#073B70`, secondary = Electric Teal `#13B8B4`. Status colors `ok / wait / act / err` mean a process state, never decoration. |
| Primitives | `app/src/components/ui/*` | shadcn components (Button, Badge, Card, Sheet, Dialog, Select, Tabs, Table, Tooltip, Popover, DropdownMenu, Sonner…). Extended only through variants (`Button decision`, `Badge ok/wait/act/err/info`). |
| Patterns | `app/src/components/app/patterns.tsx` | `PageHeader`, `Banner`, `StatCard`, `Field`, `EmptyState`, `Avatar`: how every page starts, warns, counts and asks. |
| Domain visuals | `app/src/ui.tsx` | `StateIcon`, `StateChip`, `StatusChip`, `Rail`, `Ring`, `ToneBox`: one state language for rail, timeline, drawer and lists. |
| Pages | `app/src/pages/*` | Compose patterns and primitives. No page defines its own button, chip, card or form field. |

## Conventions

- Add a component with `npx shadcn@latest add <name>` from `app/`, then fix the `cn` import to `@/lib/utils` if the CLI writes `"cn"`.
- Never hard-code a hex color in a page; use a token class (`text-primary`, `bg-secondary`, `text-ok`…).
- Motion is meaningful only: `animate-rise` (entrance), `animate-pop` (a value changed), `animate-ring` (running), logo ripple. All animation is disabled under `prefers-reduced-motion`.
- Text always comes from `i18n.ts` (DE/EN); market terms stay German.
