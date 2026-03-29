# YKS Soru Takibi ve Çözüm Platformu

## Overview

Full-stack YKS (Turkish university exam) question tracking and study platform. Dark mode by default (persisted in localStorage). Includes a question pool with canvas drawing, test builder with timer, and an interactive test mode with A/B/C/D/E answer marking.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/yks-tracker) — at previewPath `/`
- **API framework**: Express 5 (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── yks-tracker/        # React + Vite frontend (previewPath: /)
│   └── api-server/         # Express API server (previewPath: /api)
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Features

1. **Soru Havuzu (Question Pool)** - Grid view of all questions, filterable by TYT/AYT, Deneme/Banka, lesson, status. Click card to open fullscreen drawing canvas. Edit button (pencil icon) + delete on hover.
2. **Soru Ekleme/Düzenleme** - Unified `QuestionFormDialog` (create + edit). Image upload (base64 → file), lesson listbox (TYT: Türkçe/Mat/Geo/Fizik/Kim/Bio/Din/Felsefe/Tarih/Coğrafya; AYT: Mat/Geo/Fizik/Kim/Bio/TDE/Tarih/Coğrafya/Felsefe), description/notes field, choice (A-E), category, source, status.
3. **Çizim Aracı (Drawing Canvas)** - Per-question HTML5 canvas with pen (multiple colors), eraser, clear. Strokes saved as JSON in DB.
4. **Test Merkezi (Test Builder)** - Create tests from filtered pool: multi-lesson toggle pills, category, optional countdown timer (stored as `timeLimitSeconds`). Only unsolved checkbox.
5. **Test Modu (Interactive Test Mode)** - Full revamp:
   - Left: question image + A/B/C/D/E choice bubbles for current question
   - Right sidebar: answer sheet grouped by lesson, compact A/B/C/D/E bubbles per question, collapsible lesson sections
   - Top bar: always-on stopwatch or countdown timer (red when <60s)
   - Finish: compares user answers to stored `choice`, sets DogruCozuldu/YanlisHocayaSor/Cozulmedi
   - Results screen: doğru/yanlış/boş summary + per-question detail with manual status toggle
6. **Karanlık Mod (Dark Mode)** - Default dark, toggle to light, persisted in localStorage.

## Database Schema

- `questions` - Main question table (imageUrl, description, lesson, topic, publisher, testName, testNo, choice, category, source, status, hasDrawing)
- `drawings` - Canvas drawing strokes per question (JSON)
- `test_sessions` - Test session metadata (name, timeLimitSeconds)
- `test_session_questions` - Many-to-many join table

## Key Files

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth)
- `artifacts/yks-tracker/src/components/QuestionFormDialog.tsx` — unified create/edit question dialog
- `artifacts/yks-tracker/src/pages/Pool.tsx` — question pool grid
- `artifacts/yks-tracker/src/pages/Tests.tsx` — test list + builder
- `artifacts/yks-tracker/src/pages/TestMode.tsx` — interactive test solving
- `artifacts/yks-tracker/src/components/layout/Sidebar.tsx` — nav + dark mode toggle
- `artifacts/api-server/src/routes/questions.ts` — question CRUD + image upload
- `artifacts/api-server/src/routes/tests.ts` — test CRUD + status updates

## Drawing System

- **DrawingCanvas** (`artifacts/yks-tracker/src/components/canvas/DrawingCanvas.tsx`)
- Uses PointerEvents for stylus/tablet/mouse support
- Pressure-sensitive stroke width (`e.pressure`)
- Smooth bezier curves via midpoint quadratic algorithm
- Dot cursor (`cursor: none` + overlay div)
- **VEIKK/Wacom eraser detection**: `e.buttons === 32` → auto-switches to eraser mode
- Keyboard: `P` = pen, `E` = eraser, `Ctrl+Z` = undo, `Shift+Del` = clear all
- `noSave` prop: when true (test mode), drawings stay in React state only — never persisted to DB. `onTempSave` callback lets the parent persist in its own state.
- `noSave = false` (default, pool mode): saves to `drawings` table via `PUT /api/questions/:id/drawing`

## Local Setup (Running at Home)

```bash
# 1. Prerequisites: Node 20+, pnpm, Docker Desktop (recommended)
npm install -g pnpm

# 2. Install dependencies
pnpm install

# 3. Create .env from the example
cp .env.example .env

# 4. Start PostgreSQL with persistent volume
docker compose up -d

# 5. Push database schema
pnpm --filter @workspace/db run push

# 6. Start both servers (two terminals)
pnpm --filter @workspace/api-server run dev   # API on :8080
pnpm --filter @workspace/yks-tracker run dev  # Frontend on :24486
```

### Windows notes

- If `cp` is unavailable in PowerShell, use: `Copy-Item .env.example .env`
- API and frontend bind to `0.0.0.0`, so devices on the same local network can connect.
- Open Windows Firewall inbound rules for ports `8080` and `24486` (Private network).
- Access from another device with your PC's LAN IP:
  - Frontend: `http://<LAN_IP>:24486`
  - API health: `http://<LAN_IP>:8080/api/health`

## Codegen Workflow

After editing `lib/api-spec/openapi.yaml`:
```
pnpm --filter @workspace/api-spec run codegen
cd lib/api-client-react && npx tsc -p tsconfig.json  # rebuild declarations
pnpm --filter @workspace/db run push                   # if schema changed
```

## TYT vs AYT Lessons

- **TYT**: Türkçe, Matematik, Geometri, Fizik, Kimya, Biyoloji, Din Kültürü, Felsefe, Tarih, Coğrafya
- **AYT**: Matematik, Geometri, Fizik, Kimya, Biyoloji, Türk Dili ve Edebiyatı, Tarih, Coğrafya, Felsefe
