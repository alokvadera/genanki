## Overview

This project uses the following tech stack:

- Vite
- Typescript
- React Router v7 (all imports from `react-router` instead of `react-router-dom`)
- React 19 (for frontend components)
- Tailwind v4 (for styling)
- Shadcn UI (for UI components library)
- Lucide Icons (for icons)
- Neon (backend: Lakebase Postgres + Neon Functions + Neon Auth) — migrated from Convex
- Framer Motion (for animations)

Frontend files live in the `src` directory of this project; the backend lives in the sibling `server/` directory at the repository root.

Use pnpm for the package manager.

## Setup

The backend is a Neon Function (Hono REST API) deployed with `neon deploy` from the repository root. See `neon.ts` for the infrastructure definition (Postgres + Neon Auth + Function).

```bash
# Backend (from repo root)
neon deploy                 # deploy function + provision infra

# Database migrations (from server/)
pnpm drizzle-kit generate   # generate migration from schema changes
pnpm drizzle-kit migrate    # apply migrations to the database

# Frontend (from project/)
pnpm dev                    # Vite dev server
```

## Environment Variables

### Client-side (`project/.env.local`):

- `VITE_API_URL` — Neon Function base URL, e.g. `https://<function-host>` (required)

### Neon backend environment (managed via `neon.ts` / `neon env pull`):

- `DATABASE_URL` — pooled Postgres connection string (injected by Neon)
- `ENCRYPTION_PEPPER` — pepper for hashing visitor identity
- `ADMIN_SECRET` — admin passphrase for the IP admin console endpoints
- `GROQ_API_KEY` — primary AI provider (required for generation)
- `CEREBRAS_API_KEY` — fallback provider (optional)
- `OPENROUTER_API_KEY` — fallback provider for free models (optional)
- `KILO_API_KEY` — fallback provider (optional)
- `KILO_BASE_URL` — required if Kilo is enabled
- `KILO_MODEL_IDS` — comma-separated model IDs for Kilo
- `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` — Workers AI fallback (optional)

## Authentication

The app has no frontend login. Neon Auth is enabled server-side (JWT verification for `/api/me`) but the deck creator runs without auth-gated routes; visitors are identified by device token + peppered IP hash.

# Frontend Conventions

You will be using the Vite frontend with React 19, Tailwind v4, and Shadcn UI.

Generally, pages should be in the `src/pages` folder, and components should be in the `src/components` folder.

Shadcn primitives are located in the `src/components/ui` folder and should be used by default.

## Page routing

Your page component should go under the `src/pages` folder.

When adding a page, update the react router configuration in `src/main.tsx` to include the new route you just added.

## Shad CN conventions

Follow these conventions when using Shad CN components, which you should use by default.

- Remember to use "cursor-pointer" to make the element clickable
- For title text, use the "tracking-tight font-bold" class to make the text more readable
- Always make apps MOBILE RESPONSIVE. This is important
- AVOID NESTED CARDS. Try and not to nest cards, borders, components, etc. Nested cards add clutter and make the app look messy.
- AVOID SHADOWS. Avoid adding any shadows to components. stick with a thin border without the shadow.
- Avoid skeletons; instead, use the loader2 component to show a spinning loading state when loading data.

## Landing Pages

You must always create good-looking designer-level styles to your application.

- Make it well animated and fit a certain "theme", ie neo brutalist, retro, neumorphism, glass morphism, etc

Use known images and emojis from online.

(This app does not use authentication on the frontend — the landing page always shows the app entry point.)

## Responsiveness and formatting

Make sure pages are wrapped in a container to prevent the width stretching out on wide screens. Always make sure they are centered aligned and not off-center.

Always make sure that your designs are mobile responsive. Verify the formatting to ensure it has correct max and min widths as well as mobile responsiveness.

- Always create navbars for landing pages
- Always create sidebars for dashboard pages and navigate between pages
- On these bars, the created logo should be clickable and redirect to the index page

## Animating with Framer Motion

You must add animations to components using Framer Motion. It is already installed and configured in the project.

To use it, import the `motion` component from `framer-motion` and use it to wrap the component you want to animate.

### Other Items to animate

- Fade in and Fade Out
- Slide in and Slide Out animations
- Rendering animations
- Button clicks and UI elements

Animate for all components, including on landing page and app pages.

## Three JS Graphics

Your app comes with three js by default. You can use it to create 3D graphics for landing pages, games, etc.

## Colors

You can override colors in: `src/index.css`

This uses the oklch color format for tailwind v4.

Always use these color variable names.

Make sure all ui components are set up to be mobile responsive and compatible with both light and dark mode.

Set theme using `dark` or `light` variables at the parent className.

## Styling and Theming

When changing the theme, always change the underlying theme of the shad cn components app-wide under `src/components/ui` and the colors in the index.css file.

Avoid hardcoding in colors unless necessary for a use case, and properly implement themes through the underlying shad cn ui components.

When styling, ensure buttons and clickable items have pointer-click on them (don't by default).

Always follow a set theme style and ensure it is tuned to the user's liking.

## Toasts

You should always use toasts to display results to the user, such as confirmations, results, errors, etc.

Use the shad cn Sonner component as the toaster. For example:

```
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
export function SonnerDemo() {
  return (
    <Button
      variant="outline"
      onClick={() =>
        toast("Event has been created", {
          description: "Sunday, December 03, 2023 at 9:00 AM",
          action: {
            label: "Undo",
            onClick: () => console.log("Undo"),
          },
        })
      }
    >
      Show Toast
    </Button>
  )
}
```

Remember to import { toast } from "sonner". Usage: `toast("Event has been created.")`

## Dialogs

Always ensure your larger dialogs have a scroll in its content to ensure that its content fits the screen size. Make sure that the content is not cut off from the screen.

Ideally, instead of using a new page, use a Dialog instead.

# Using the Neon backend

The backend is a Hono REST API running as a Neon Function over Lakebase Postgres (Drizzle ORM). It lives in the sibling `server/` directory at the repository root, not in this project.

## Schema

The database schema is defined in `server/db/schema.ts` (Drizzle). To change it:

```bash
cd server
./node_modules/.bin/drizzle-kit generate   # emit SQL migration into server/drizzle/
./node_modules/.bin/drizzle-kit migrate    # apply it
```

All tables use `uuid` primary keys and `timestamptz` timestamps; the REST boundary uses epoch-millisecond numbers to keep the API shape stable.

## Adding an endpoint

1. Add/extend a data service in `server/services/` (all SQL lives there).
2. Register the route in `server/app.ts`.
3. Add a typed client function in `project/src/lib/api.ts`.
4. Consume it with `useApiQuery` (polling) or `useApiMutation` from `project/src/hooks/use-api-query.ts`.

## Common Mistakes To Avoid

- Don't import `server/` code from the frontend — everything crosses the REST boundary via `src/lib/api.ts`.
- Don't put SQL in `app.ts` route handlers; keep it in services.
- Handle `undefined` (loading) vs `null` (server returned null) in `useApiQuery` consumers, same as the old useQuery contract.
- Always use the `@/folder` path alias for frontend imports.
- Server-only secrets (`ADMIN_SECRET`, `ENCRYPTION_PEPPER`, provider keys) never get `VITE_` prefixes.
