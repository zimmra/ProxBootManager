import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { AlertCircle, GripVertical, ServerOff } from 'lucide-react';
import { formatStartup, parseStartup } from '../api/proxmox';
import { useReorderGuests, useUpdateBoot } from '../hooks/useProxmox';
import type { FilterState, Guest, ReorderEntry } from '../types';
import { GuestRow } from './GuestRow';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Skeleton } from './ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

function arrayMove<T>(array: T[], from: number, to: number): T[] {
  const result = [...array];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}

export function filterGuests(guests: Guest[], filters: FilterState): Guest[] {
  return guests.filter((guest) => {
    if (filters.type !== 'all' && guest.type !== filters.type) return false;
    if (filters.autoboot === 'enabled' && !guest.onboot) return false;
    if (filters.autoboot === 'disabled' && guest.onboot) return false;
    const query = filters.search.trim().toLowerCase();
    if (query && !guest.name.toLowerCase().includes(query) && !String(guest.vmid).includes(query)) return false;
    return true;
  });
}

interface GuestTableProps {
  guests: Guest[];
  isLoading: boolean;
  error: Error | null;
  filters: FilterState;
}

export function GuestTable({ guests, isLoading, error, filters }: GuestTableProps) {
  const [orderedIds, setOrderedIds] = useState<number[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [pendingOnbootIds, setPendingOnbootIds] = useState<Set<number>>(new Set());
  const [pendingStartupIds, setPendingStartupIds] = useState<Set<number>>(new Set());
  const updateBoot = useUpdateBoot();
  const reorder = useReorderGuests();

  const isFiltered = filters.search !== '' || filters.type !== 'all' || filters.autoboot !== 'all';

  useEffect(() => {
    if (reorder.isPending) return;
    const sorted = [...guests].sort((a, b) => {
      const orderA = parseStartup(a.startup).order ?? Number.POSITIVE_INFINITY;
      const orderB = parseStartup(b.startup).order ?? Number.POSITIVE_INFINITY;
      if (orderA !== orderB) return orderA - orderB;
      return a.vmid - b.vmid;
    });
    setOrderedIds(sorted.map((guest) => guest.vmid));
  }, [guests, reorder.isPending]);

  const orderedGuests = useMemo(() => {
    const byId = new Map(guests.map((guest) => [guest.vmid, guest]));
    const ordered = orderedIds.flatMap((id) => {
      const guest = byId.get(id);
      return guest ? [guest] : [];
    });
    const seen = new Set(ordered.map((guest) => guest.vmid));
    return [...ordered, ...guests.filter((guest) => !seen.has(guest.vmid))];
  }, [guests, orderedIds]);

  const filteredGuests = useMemo(() => filterGuests(orderedGuests, filters), [orderedGuests, filters]);
  const sortableIds = filteredGuests.map((guest) => guest.vmid);
  const activeGuest = activeId === null ? null : guests.find((guest) => guest.vmid === activeId);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function clearPending(vmid: number, kind: 'onboot' | 'startup') {
    const setter = kind === 'onboot' ? setPendingOnbootIds : setPendingStartupIds;
    setter((current) => {
      const next = new Set(current);
      next.delete(vmid);
      return next;
    });
  }

  function handleOnboot(vmid: number, type: Guest['type'], onboot: boolean) {
    setPendingOnbootIds((current) => new Set(current).add(vmid));
    updateBoot.mutate(
      { vmid, type, onboot },
      { onSettled: () => clearPending(vmid, 'onboot') },
    );
  }

  function handleStartup(vmid: number, type: Guest['type'], startup: string) {
    setPendingStartupIds((current) => new Set(current).add(vmid));
    updateBoot.mutate(
      { vmid, type, startup },
      { onSettled: () => clearPending(vmid, 'startup') },
    );
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(Number(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortableIds.indexOf(Number(active.id));
    const newIndex = sortableIds.indexOf(Number(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedVisibleIds = arrayMove(sortableIds, oldIndex, newIndex);
    const visibleSet = new Set(sortableIds);
    const nextOrderedIds = [...reorderedVisibleIds, ...orderedIds.filter((id) => !visibleSet.has(id))];
    setOrderedIds(nextOrderedIds);

    const byId = new Map(guests.map((guest) => [guest.vmid, guest]));
    const entries: ReorderEntry[] = nextOrderedIds.flatMap((id, index) => {
      const guest = byId.get(id);
      if (!guest) return [];
      const order = index + 1;
      return [{ vmid: guest.vmid, type: guest.type, order, startup: formatStartup({ ...parseStartup(guest.startup), order }) }];
    });
    reorder.mutate(entries);
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Failed to load guests</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="overflow-hidden rounded-xl border border-border bg-card/80 shadow-2xl shadow-black/20">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-16">VMID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-20">Type</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-24">Autoboot</TableHead>
              <TableHead className="w-20">Order</TableHead>
              <TableHead className="w-24">Delay (up)</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, row) => (
                <TableRow key={row}>
                  {Array.from({ length: 8 }).map((__, col) => (
                    <TableCell key={col}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading && (
              <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                {filteredGuests.map((guest) => (
                  <GuestRow
                    key={`${guest.type}-${guest.vmid}`}
                    guest={guest}
                    isOnbootPending={pendingOnbootIds.has(guest.vmid)}
                    isStartupPending={pendingStartupIds.has(guest.vmid)}
                    onUpdateOnboot={handleOnboot}
                    onUpdateStartup={handleStartup}
                    isDragDisabled={isFiltered || reorder.isPending}
                  />
                ))}
              </SortableContext>
            )}

            {!isLoading && filteredGuests.length === 0 && (
              <TableRow>
                <TableCell colSpan={8}>
                  <div className="flex flex-col items-center gap-2 py-14 text-muted-foreground">
                    <ServerOff className="h-9 w-9 opacity-40" />
                    <span className="text-sm">
                      {guests.length === 0 ? 'No VMs or LXCs found on this node.' : 'No guests match the current filters.'}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <DragOverlay>
        {activeGuest && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 shadow-2xl ring-1 ring-ring/20">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono text-xs text-muted-foreground">{activeGuest.vmid}</span>
            <span className="font-medium">{activeGuest.name}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
