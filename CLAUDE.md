# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Golf lesson booking platform at **golflessons.be**. Pros subscribe annually, configure availability, and receive lesson payments. Students browse pros, book lessons, and get a personal coaching page with tips, photos, videos, and WhatsApp-style conversations. Sister site of silverswing.golf.

## Commands

```bash
pnpm dev          # Start dev server (Turbopack)
pnpm build        # Production build
pnpm lint         # ESLint
```

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack, src/ dir)
- **Language**: TypeScript 5 (strict)
- **UI**: shadcn/ui + Tailwind CSS 4
- **Fonts**: Cormorant Garamond (display/headings), Outfit (body/sans)
- **ORM**: Drizzle ORM + Neon Postgres
- **Storage**: Vercel Blob
- **Payments**: Stripe Connect Express (lesson payments to pros) + direct Stripe (pro subscriptions)
- **Auth**: Custom JWT (jose + bcryptjs) — pattern from silverswing
- **i18n**: EN, NL, FR
- **Deployment**: Vercel (password-protected pre-launch)
- **Package manager**: pnpm
- **Testing**: Vitest

## Design Language

Luxury green + gold palette inspired by silverswing.golf:
- Light mode, warm cream background (#faf7f0)
- Deep green palette (#091a12 → #f0f7f2) with gold accents (#c4a035)
- Cards: `rounded-xl border-green-200 bg-white hover:border-green-300`
- CTAs: `bg-gold-600 text-white hover:bg-gold-500 rounded-md`
- Dark green header/footer (`bg-green-950`) with `text-gold-200`
- Headings: `font-display` (Cormorant Garamond), Body: `font-sans` (Outfit)

## Architecture

```
src/
  app/
    mockups/              # Static mockup pages (pro-profile, booking, student-page)
    layout.tsx            # Root layout (fonts, globals)
    page.tsx              # Index with links to mockups
  components/ui/          # shadcn/ui components
  lib/utils.ts            # cn() utility
docs/
  design.md               # Full design document with decisions, schema, phases
```

## Key Design Decisions

See `docs/design.md` for full details. Summary:
- Lesson booking engine will be copied from silverswing (then removed from silverswing)
- Stripe Connect Express for routing payments to pros
- Commission model TBD (may be 0% + higher annual subscription)
- One subscription tier for now, schema supports multiple later
- Video hosting: Vercel Blob for now, revisit later
