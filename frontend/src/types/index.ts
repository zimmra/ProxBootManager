export type GuestType = 'qemu' | 'lxc' | 'vm';
export type NormalizedGuestType = 'qemu' | 'lxc';
export type GuestStatus = 'running' | 'stopped' | string;
export type FilterType = 'all' | NormalizedGuestType;
export type FilterAutoboot = 'all' | 'enabled' | 'disabled';

export interface StartupConfig {
  order?: number;
  up?: number;
  down?: number;
}

export interface Guest {
  vmid: number;
  name: string;
  type: NormalizedGuestType;
  onboot: boolean;
  startup: string;
  status: GuestStatus;
  node?: string;
}

export interface ProxmoxStatus {
  configured?: boolean;
  envSet?: {
    PROXMOX_HOST: boolean;
    PROXMOX_TOKEN_ID: boolean;
    PROXMOX_TOKEN_SECRET: boolean;
    PROXMOX_NODE: boolean;
  };
  connected: boolean;
  connectionError?: string | null;
  node?: string;
  host?: string;
  version?: string;
  error?: string | null;
  checkedAt?: string;
}

export interface GuestsResponse {
  guests: Guest[];
  status?: ProxmoxStatus;
}

export interface ReorderEntry {
  vmid: number;
  type: NormalizedGuestType;
  order: number;
  startup: string;
}

export interface FilterState {
  search: string;
  type: FilterType;
  autoboot: FilterAutoboot;
}

export const BOOT_BANDS = [1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;
export type BandValue = (typeof BOOT_BANDS)[number];

export interface PendingOverride {
  onboot?: boolean;
  startup?: string;
}
