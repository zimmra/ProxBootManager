import axios from 'axios';
import type {
  Guest,
  GuestsResponse,
  NormalizedGuestType,
  ProxmoxStatus,
  ReorderEntry,
  StartupConfig,
  StartupUpdatePayload,
} from '../types';

const rawBase = import.meta.env.VITE_API_BASE_URL?.trim();
const baseURL = rawBase
  ? rawBase.endsWith('/api')
    ? rawBase
    : `${rawBase.replace(/\/$/, '')}/api`
  : '/api';

const api = axios.create({ baseURL, timeout: 10_000 });

function normalizeType(type: string): NormalizedGuestType {
  return type === 'lxc' ? 'lxc' : 'qemu';
}

function normalizeGuest(guest: Guest & { type: string }): Guest {
  return { ...guest, type: normalizeType(guest.type) };
}

export function parseStartup(startup?: string | null): StartupConfig {
  const config: StartupConfig = {};
  if (!startup) return config;

  for (const part of startup.split(',')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim();
    const value = Number.parseInt(part.slice(eqIdx + 1), 10);
    if (Number.isNaN(value)) continue;
    if (key === 'order') config.order = value;
    if (key === 'up') config.up = value;
    if (key === 'down') config.down = value;
  }

  return config;
}

export function formatStartup(config: StartupConfig): string {
  return [
    config.order !== undefined ? `order=${config.order}` : null,
    config.up !== undefined ? `up=${config.up}` : null,
    config.down !== undefined ? `down=${config.down}` : null,
  ]
    .filter(Boolean)
    .join(',');
}

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: string; message?: string } | undefined;
    return data?.error ?? data?.message ?? error.message;
  }
  return error instanceof Error ? error.message : 'Unknown error';
}

export async function getStatus(): Promise<ProxmoxStatus> {
  const { data } = await api.get<ProxmoxStatus>('/status');
  return data;
}

export async function getGuests(): Promise<Guest[]> {
  const { data } = await api.get<Guest[] | GuestsResponse>('/guests');
  const guests = Array.isArray(data) ? data : data.guests;
  return guests.map((guest) => normalizeGuest(guest as Guest & { type: string }));
}

export async function updateGuestStartup(
  type: NormalizedGuestType,
  vmid: number,
  payload: StartupUpdatePayload,
): Promise<Guest> {
  const { data } = await api.put<Guest>(`/guests/${type}/${vmid}/startup`, payload);
  return normalizeGuest(data as Guest & { type: string });
}

export async function reorderGuests(entries: ReorderEntry[]): Promise<Guest[]> {
  const { data } = await api.put<Guest[] | GuestsResponse>('/guests/reorder', { guests: entries });
  const guests = Array.isArray(data) ? data : data.guests;
  return guests.map((guest) => normalizeGuest(guest as Guest & { type: string }));
}
