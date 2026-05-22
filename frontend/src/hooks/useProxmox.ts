import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  formatStartup,
  getGuests,
  getStatus,
  parseStartup,
  reorderGuests,
  updateGuestStartup,
} from '../api/proxmox';
import type { Guest, NormalizedGuestType, ProxmoxStatus, ReorderEntry, StartupConfig } from '../types';

export const guestsQueryKey = ['guests'] as const;
export const statusQueryKey = ['status'] as const;

export function useStatus() {
  return useQuery<ProxmoxStatus>({
    queryKey: statusQueryKey,
    queryFn: getStatus,
    refetchInterval: 30_000,
    retry: 1,
  });
}

export function useGuests() {
  return useQuery<Guest[]>({
    queryKey: guestsQueryKey,
    queryFn: getGuests,
    refetchInterval: 30_000,
    retry: 1,
  });
}

export function useUpdateBoot() {
  const queryClient = useQueryClient();

  return useMutation<Guest, Error, { vmid: number; type: NormalizedGuestType; onboot?: boolean; startup?: string }, { previous?: Guest[] }>({
    mutationFn: ({ vmid, type, onboot, startup }) => updateGuestStartup(type, vmid, { onboot, startup }),
    onMutate: async ({ vmid, onboot, startup }) => {
      await queryClient.cancelQueries({ queryKey: guestsQueryKey });
      const previous = queryClient.getQueryData<Guest[]>(guestsQueryKey);
      queryClient.setQueryData<Guest[]>(guestsQueryKey, (old) =>
        old?.map((guest) =>
          guest.vmid === vmid
            ? {
                ...guest,
                onboot: onboot ?? guest.onboot,
                startup: startup ?? guest.startup,
              }
            : guest,
        ),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(guestsQueryKey, context.previous);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: guestsQueryKey }),
  });
}

export function useReorderGuests() {
  const queryClient = useQueryClient();

  return useMutation<Guest[], Error, ReorderEntry[], { previous?: Guest[] }>({
    mutationFn: reorderGuests,
    onMutate: async (entries) => {
      await queryClient.cancelQueries({ queryKey: guestsQueryKey });
      const previous = queryClient.getQueryData<Guest[]>(guestsQueryKey);
      const startupById = new Map(entries.map((entry) => [entry.vmid, entry.startup]));
      queryClient.setQueryData<Guest[]>(guestsQueryKey, (old) =>
        old?.map((guest) => ({
          ...guest,
          startup: startupById.get(guest.vmid) ?? guest.startup,
        })),
      );
      return { previous };
    },
    onError: (_error, _entries, context) => {
      if (context?.previous) queryClient.setQueryData(guestsQueryKey, context.previous);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: guestsQueryKey }),
  });
}

export function updateStartupValue(startup: string, patch: Partial<StartupConfig>): string {
  return formatStartup({ ...parseStartup(startup), ...patch });
}
