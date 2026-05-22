# ProxBootManager

A web-based manager for Proxmox VE boot order and PXE boot configuration.

## Structure

```
ProxBootManager/
├── backend/          # Express + TypeScript API
│   ├── src/
│   │   └── index.ts  # Entry point
│   ├── .env.example  # Copy to .env and fill in Proxmox credentials
│   └── tsconfig.json
└── frontend/         # React + Vite + TypeScript UI
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx
    │   └── index.css
    ├── components.json  # shadcn/ui config (new-york, slate)
    └── tailwind.config.js
```

## Commands

```bash
# Install all dependencies
npm install

# Run both frontend and backend in dev mode
npm run dev

# Build both
npm run build

# Run backend only
npm run dev --workspace=backend

# Run frontend only
npm run dev --workspace=frontend
```

## Backend Setup

Copy `backend/.env.example` to `backend/.env` and fill in your Proxmox credentials:

```bash
cp backend/.env.example backend/.env
```

## Conventions

- Backend: Express routes under `backend/src/routes/`, Proxmox API calls via axios
- Frontend: shadcn/ui components via `npx shadcn@latest add <component>`, placed in `frontend/src/components/ui/`
- Path alias `@/` maps to `frontend/src/`
- API proxy: Vite dev server proxies `/api` to `http://localhost:3001`
- No direct Proxmox calls from the frontend; all Proxmox access goes through the backend
