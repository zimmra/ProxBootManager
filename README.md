# ProxBootManager

ProxBootManager is a lightweight web dashboard for managing Proxmox VE VM and LXC autoboot behavior from a clean, modern UI. It lets homelab admins see guests in one place, toggle `onboot`, edit Proxmox startup order/delay strings, and drag guests into the boot sequence they want without jumping through the full Proxmox interface.

## What it does

- Lists QEMU VMs and LXC containers for a configured Proxmox node.
- Shows guest VMID, name, type, running/stopped status, autoboot state, boot order, and boot delay.
- Toggles autoboot with optimistic UI updates.
- Edits Proxmox startup strings such as `order=1,up=30,down=10`.
- Supports drag-and-drop reorder with batch save to Proxmox.
- Displays backend/Proxmox connection status and user-friendly error messages.
- Ships with a Debian 12 LXC installer and systemd service.
- Serves the production React frontend from the Express backend.

## Architecture

```text
Browser
  |
  v
React/Vite frontend (TailwindCSS + shadcn-style UI)
  |
  v
Node.js/Express backend proxy
  |
  v
Proxmox VE API (https://<host>:8006/api2/json)
```

## Prerequisites

- A Proxmox VE host/node reachable from the install target.
- A Proxmox API token with permission to audit guests and update VM/LXC options.
- A Debian 12 (Bookworm) **unprivileged** LXC container to run ProxBootManager.
- Network access from the container to `https://<PROXMOX_HOST>:8006`.

> **Note:** The installer and systemd service run as `root` inside the container. In an unprivileged LXC, the container's root UID is mapped to an unprivileged host UID by Proxmox, so this is safe and expected.

## Quick Install

Run this as root inside a fresh Debian 12 LXC/container:

```bash
bash <(curl -s https://raw.githubusercontent.com/zimmra/ProxBootManager/main/install.sh)
```

The installer will install Node.js 20, clone/update the app in `/opt/proxbootmanager`, build the frontend and backend, prompt for Proxmox settings, create a systemd service, and start ProxBootManager on port `3001`.

After install, open:

```text
http://<LXC_IP>:3001
```

## Configuration

Runtime configuration lives in `/opt/proxbootmanager/backend/.env` for production installs. After editing it, restart the service:

```bash
sudo systemctl restart proxbootmanager
```

| Variable | Required | Example | Description |
| --- | --- | --- | --- |
| `PROXMOX_HOST` | Yes | `192.168.1.10` or `pve.example.local` | Proxmox host/IP without protocol or port. The backend connects to `https://<host>:8006/api2/json`. |
| `PROXMOX_TOKEN_ID` | Yes | `root@pam!proxbootmanager` | Full Proxmox API token ID. |
| `PROXMOX_TOKEN_SECRET` | Yes | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | Proxmox API token secret. Never returned to the frontend. |
| `PROXMOX_NODE` | Yes | `pve` | Proxmox node name whose VMs/LXCs should be managed. |
| `PORT` | No | `3001` | HTTP port for the Express backend and production UI. |
| `VERIFY_SSL` | No | `false` | Set `false` for self-signed Proxmox certificates; set `true` for trusted certificates. |
| `NODE_ENV` | No | `production` | Enables production static frontend serving when set to `production`. |
| `CORS_ORIGIN` | No | `http://localhost:5173` or `*` | Comma-separated allowed origins. Defaults to `*`; localhost dev origins are always included. |

## How to Create a Proxmox API Token

1. Log in to the Proxmox VE web UI.
2. Go to **Datacenter → Permissions → API Tokens**.
3. Click **Add**.
4. Choose a user, for example `root@pam` or a dedicated user.
5. Enter a token ID, for example `proxbootmanager`.
6. Leave **Privilege Separation** enabled for least privilege, or disable it only if you understand the security implications.
7. Copy the generated secret immediately; Proxmox shows it only once.
8. Grant permissions under **Datacenter → Permissions**.

Minimum practical permissions for the user/token:

- `VM.Audit` — list/read guest data and config.
- `VM.Config.Options` — update `onboot` and `startup` options.
- `Datastore.Audit` — useful for inventory/read operations in many Proxmox setups.

Alternatively, assign an existing role such as `PVEVMAdmin` to the relevant path (for example `/vms` or the target node) if that matches your security model.

Use these values during install:

```text
PROXMOX_TOKEN_ID=root@pam!proxbootmanager
PROXMOX_TOKEN_SECRET=<secret copied from Proxmox>
```

## Updating

Run the installer again:

```bash
sudo bash /opt/proxbootmanager/install.sh
```

It will pull the latest code, reinstall dependencies if needed, rebuild, preserve or optionally rewrite `.env`, and restart the systemd service.

You can also manually update:

```bash
cd /opt/proxbootmanager
sudo git pull --ff-only
sudo npm install
sudo npm run build --prefix frontend
sudo npm run build --prefix backend
sudo systemctl restart proxbootmanager
```

## Service Management

```bash
sudo systemctl status proxbootmanager
sudo journalctl -u proxbootmanager -f
sudo systemctl restart proxbootmanager
```

## Development

Clone the repository:

```bash
git clone https://github.com/zimmra/ProxBootManager.git
cd ProxBootManager
npm install
```

Configure the backend:

```bash
cp backend/.env.example backend/.env
# edit backend/.env with your Proxmox settings
```

Run the backend in development mode:

```bash
cd backend
npm install
npm run dev
```

Run the frontend in another terminal:

```bash
cd frontend
npm install
printf 'VITE_API_BASE_URL=http://localhost:3001\n' > .env
npm run dev
```

Development URLs:

- Frontend: <http://localhost:5173>
- Backend API: <http://localhost:3001>
- Health check: <http://localhost:3001/api/health>

Useful checks:

```bash
cd backend && npx tsc --noEmit
cd frontend && npm run build
bash -n install.sh
```

## Tech Stack

- **Frontend:** React, Vite, TypeScript, TailwindCSS, shadcn-style components, TanStack Query, Axios, dnd-kit, Sonner, Lucide icons.
- **Backend:** Node.js, Express, TypeScript, Axios, dotenv, CORS.
- **Deployment:** Debian 12 LXC, Node.js 20 LTS, systemd.
- **Package management:** npm workspaces.

## Security Notes

- Proxmox credentials are read only by the backend from `.env`, which is stored at `/opt/proxbootmanager/backend/.env` with mode `600`.
- `/api/config/status` reports whether required env vars are set, but does not expose secret values.
- Use a Proxmox token with the least privileges needed for your environment.
- The service runs as `root` inside an unprivileged LXC container. Proxmox maps the container's root UID to an unprivileged host UID, providing host-level isolation without requiring a separate service account inside the container.
- If possible, run ProxBootManager on a trusted management network or behind your preferred reverse proxy/auth layer.

## License

See [LICENSE](./LICENSE).
