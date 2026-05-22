import { Router, Request, Response, NextFunction } from 'express';
import { proxmox } from '../proxmox';

const router = Router();

router.get('/status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const envSet = {
      PROXMOX_HOST: !!process.env.PROXMOX_HOST,
      PROXMOX_TOKEN_ID: !!process.env.PROXMOX_TOKEN_ID,
      PROXMOX_TOKEN_SECRET: !!process.env.PROXMOX_TOKEN_SECRET,
      PROXMOX_NODE: !!process.env.PROXMOX_NODE,
    };

    const configured = Object.values(envSet).every(Boolean);

    let connected = false;
    let connectionError: string | null = null;

    if (configured) {
      try {
        await proxmox.getNodes();
        connected = true;
      } catch (err) {
        connectionError = err instanceof Error ? err.message : String(err);
      }
    }

    res.json({ configured, envSet, connected, connectionError });
  } catch (err) {
    next(err);
  }
});

export default router;
