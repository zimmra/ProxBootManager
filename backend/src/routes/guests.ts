import { Router, Request, Response, NextFunction } from 'express';
import { proxmox } from '../proxmox';

const router = Router();

interface Guest {
  vmid: number;
  name: string;
  type: 'qemu' | 'lxc';
  onboot: boolean;
  startup: string;
  status: string;
}

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const node = proxmox.getConfiguredNode();
    const [vms, lxcs] = await Promise.all([proxmox.getVMs(node), proxmox.getLXCs(node)]);

    const configs = await Promise.all([
      ...vms.map(async (vm) => {
        const cfg = await proxmox.getVMConfig(node, vm.vmid);
        return {
          vmid: vm.vmid,
          name: vm.name || String(vm.vmid),
          type: 'qemu' as const,
          onboot: cfg.onboot === 1,
          startup: cfg.startup || '',
          status: vm.status,
        } satisfies Guest;
      }),
      ...lxcs.map(async (ct) => {
        const cfg = await proxmox.getLXCConfig(node, ct.vmid);
        return {
          vmid: ct.vmid,
          name: ct.name || String(ct.vmid),
          type: 'lxc' as const,
          onboot: cfg.onboot === 1,
          startup: cfg.startup || '',
          status: ct.status,
        } satisfies Guest;
      }),
    ]);

    res.json(configs.sort((a, b) => a.vmid - b.vmid));
  } catch (err) {
    next(err);
  }
});

router.put('/:vmid/onboot', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const vmid = parseInt(req.params.vmid, 10);
    const { onboot, type } = req.body as { onboot: boolean; type: 'qemu' | 'lxc' };
    const node = proxmox.getConfiguredNode();
    const data = { onboot: onboot ? 1 : 0 };

    if (type === 'lxc') {
      await proxmox.updateLXCConfig(node, vmid, data);
    } else {
      await proxmox.updateVMConfig(node, vmid, data);
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.put('/:vmid/startup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const vmid = parseInt(req.params.vmid, 10);
    const { startup, type } = req.body as { startup: string; type: 'qemu' | 'lxc' };
    const node = proxmox.getConfiguredNode();
    const data = { startup };

    if (type === 'lxc') {
      await proxmox.updateLXCConfig(node, vmid, data);
    } else {
      await proxmox.updateVMConfig(node, vmid, data);
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.put('/reorder', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const entries = req.body as Array<{ vmid: number; type: 'qemu' | 'lxc'; startup: string }>;
    const node = proxmox.getConfiguredNode();

    await Promise.all(
      entries.map(({ vmid, type, startup }) => {
        const data = { startup };
        return type === 'lxc'
          ? proxmox.updateLXCConfig(node, vmid, data)
          : proxmox.updateVMConfig(node, vmid, data);
      }),
    );

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
