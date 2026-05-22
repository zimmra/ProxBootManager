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
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { AlertCircle, GripVertical, Save, ServerOff, Undo2 } from 'lucide-react';
import { formatStartup, getApiErrorMessage, parseStartup, updateOnboot, updateStartup } from '../api/proxmox';
import type { FilterState, Guest, NormalizedGuestType, PendingOverride, ReorderEntry } from '../types';
import { BOOT_BANDS } from '../types';
import { BootBandRow } from './BootBandRow';
import { GuestRow } from './GuestRow';
import { SaveChangesDialog } from './SaveChangesDialog';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { guestsQueryKey } from '../hooks/useProxmox';

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

function getGuestBand(startup: string): number | null {
  const order = parseStartup(startup).order;
  if (order === undefined) return null;
  return BOOT_BANDS.includes(order as (typeof BOOT_BANDS)[number]) ? order : null;
}

function assignBandOrder(startup: string, bandValue: number): string {
  return formatStartup({ ...parseStartup(startup), order: bandValue });
}

interface GuestTableProps {
  guests: Guest[];
  isLoading: boolean;
  error: Error | null;
  filters: FilterState;
}

export function GuestTable({ guests, isLoading, error, filters }: GuestTableProps) {
  const queryClient = useQueryClient();

  // Ordered IDs (stable sort order, updated on drag)
  const [orderedIds, setOrderedIds] = useState<number[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [overBandValue, setOverBandValue] = useState<number | null>(null);

  // Pending changes: vmid → overrides not yet applied to server
  const [pendingOverrides, setPendingOverrides] = useState<Map<number, PendingOverride>>(new Map());
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const isFiltered = filters.search !== '' || filters.type !== 'all' || filters.autoboot !== 'all';
  const pendingCount = pendingOverrides.size;

  // Sync orderedIds when guests data refreshes (but not during a drag)
  useEffect(() => {
    if (activeId !== null) return;
    const guestsWithDisplay = guests.map((g) => ({
      ...g,
      startup: pendingOverrides.get(g.vmid)?.startup ?? g.startup,
    }));
    const sorted = [...guestsWithDisplay].sort((a, b) => {
      const orderA = parseStartup(a.startup).order ?? Number.POSITIVE_INFINITY;
      const orderB = parseStartup(b.startup).order ?? Number.POSITIVE_INFINITY;
      if (orderA !== orderB) return orderA - orderB;
      return a.vmid - b.vmid;
    });
    setOrderedIds(sorted.map((g) => g.vmid));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guests]);

  // Effective display data (server data merged with pending overrides)
  const displayGuests = useMemo(
    () =>
      guests.map((g) => {
        const override = pendingOverrides.get(g.vmid);
        if (!override) return g;
        return {
          ...g,
          onboot: override.onboot ?? g.onboot,
          startup: override.startup ?? g.startup,
        };
      }),
    [guests, pendingOverrides],
  );

  const orderedGuests = useMemo(() => {
    const byId = new Map(displayGuests.map((g) => [g.vmid, g]));
    const ordered = orderedIds.flatMap((id) => {
      const g = byId.get(id);
      return g ? [g] : [];
    });
    const seen = new Set(ordered.map((g) => g.vmid));
    return [...ordered, ...displayGuests.filter((g) => !seen.has(g.vmid))];
  }, [displayGuests, orderedIds]);

  const filteredGuests = useMemo(() => filterGuests(orderedGuests, filters), [orderedGuests, filters]);
  const sortableIds = filteredGuests.map((g) => g.vmid);
  const activeGuest = activeId === null ? null : displayGuests.find((g) => g.vmid === activeId);

  // Group guests by band for rendering
  const bandedGuests = useMemo(() => {
    const groups: Array<{ band: number | null; guests: Guest[] }> = [];

    // Bands in order, plus ungrouped at the end
    const bandMap = new Map<number | null, Guest[]>();
    for (const b of BOOT_BANDS) bandMap.set(b, []);
    bandMap.set(null, []);

    for (const g of filteredGuests) {
      const band = getGuestBand(g.startup);
      const key = band !== null && BOOT_BANDS.includes(band as (typeof BOOT_BANDS)[number]) ? band : null;
      bandMap.get(key)!.push(g);
    }

    for (const b of BOOT_BANDS) {
      groups.push({ band: b, guests: bandMap.get(b)! });
    }
    const ungrouped = bandMap.get(null)!;
    if (ungrouped.length > 0) {
      groups.push({ band: null, guests: ungrouped });
    }

    return groups;
  }, [filteredGuests]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function setPendingStartup(vmid: number, startup: string) {
    setPendingOverrides((prev) => {
      const next = new Map(prev);
      next.set(vmid, { ...next.get(vmid), startup });
      return next;
    });
  }

  function handleOnboot(vmid: number, _type: NormalizedGuestType, onboot: boolean) {
    setPendingOverrides((prev) => {
      const next = new Map(prev);
      next.set(vmid, { ...next.get(vmid), onboot });
      return next;
    });
  }

  function handleStartup(vmid: number, _type: NormalizedGuestType, startup: string) {
    setPendingStartup(vmid, startup);
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(Number(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    if (!event.over) {
      setOverBandValue(null);
      return;
    }
    const overId = String(event.over.id);
    if (overId.startsWith('band-')) {
      const val = parseInt(overId.replace('band-', ''), 10);
      setOverBandValue(isNaN(val) ? null : val);
    } else {
      setOverBandValue(null);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    setOverBandValue(null);
    const { active, over } = event;
    if (!over) return;

    const activeVmid = Number(active.id);
    const overIdStr = String(over.id);

    // Dropped on a band header → assign that band's order value
    if (overIdStr.startsWith('band-')) {
      const bandValue = parseInt(overIdStr.replace('band-', ''), 10);
      if (!isNaN(bandValue)) {
        const serverGuest = guests.find((g) => g.vmid === activeVmid);
        if (serverGuest) {
          const currentStartup = pendingOverrides.get(activeVmid)?.startup ?? serverGuest.startup;
          const newStartup = assignBandOrder(currentStartup, bandValue);
          setPendingStartup(activeVmid, newStartup);
          // Re-sort orderedIds
          setOrderedIds((prev) => {
            const withoutActive = prev.filter((id) => id !== activeVmid);
            // Insert in sorted position
            const sorted = [...withoutActive].sort((a, b) => {
              const aG = displayGuests.find((g) => g.vmid === a);
              const bG = displayGuests.find((g) => g.vmid === b);
              const orderA = parseStartup(aG?.startup ?? '').order ?? Number.POSITIVE_INFINITY;
              const orderB = parseStartup(bG?.startup ?? '').order ?? Number.POSITIVE_INFINITY;
              return orderA - orderB;
            });
            const insertAt = sorted.findIndex((id) => {
              const g = displayGuests.find((dg) => dg.vmid === id);
              const o = parseStartup(g?.startup ?? '').order ?? Number.POSITIVE_INFINITY;
              return o > bandValue;
            });
            const pos = insertAt === -1 ? sorted.length : insertAt;
            sorted.splice(pos, 0, activeVmid);
            return sorted;
          });
        }
      }
      return;
    }

    // Dropped on another guest → reorder
    if (active.id === over.id) return;
    const oldIndex = sortableIds.indexOf(Number(active.id));
    const newIndex = sortableIds.indexOf(Number(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedVisibleIds = arrayMove(sortableIds, oldIndex, newIndex);
    const visibleSet = new Set(sortableIds);
    const nextOrderedIds = [...reorderedVisibleIds, ...orderedIds.filter((id) => !visibleSet.has(id))];
    setOrderedIds(nextOrderedIds);

    // Assign sequential orders and queue as pending
    const byId = new Map(guests.map((g) => [g.vmid, g]));
    const entries: ReorderEntry[] = nextOrderedIds.flatMap((id, index) => {
      const g = byId.get(id);
      if (!g) return [];
      const order = index + 1;
      return [{ vmid: g.vmid, type: g.type, order, startup: formatStartup({ ...parseStartup(g.startup), order }) }];
    });
    setPendingOverrides((prev) => {
      const next = new Map(prev);
      for (const entry of entries) {
        next.set(entry.vmid, { ...next.get(entry.vmid), startup: entry.startup });
      }
      return next;
    });
  }

  function handleDiscardChanges() {
    setPendingOverrides(new Map());
  }

  async function handleConfirmSave() {
    setIsSaving(true);
    try {
      const applyPromises: Promise<void>[] = [];

      for (const [vmid, override] of pendingOverrides.entries()) {
        const serverGuest = guests.find((g) => g.vmid === vmid);
        if (!serverGuest) continue;

        if (override.onboot !== undefined && override.onboot !== serverGuest.onboot) {
          applyPromises.push(updateOnboot(vmid, serverGuest.type, override.onboot));
        }
        if (override.startup !== undefined && override.startup !== serverGuest.startup) {
          applyPromises.push(updateStartup(vmid, serverGuest.type, override.startup));
        }
      }

      await Promise.all(applyPromises);
      toast.success(`Applied ${applyPromises.length} change${applyPromises.length !== 1 ? 's' : ''} to Proxmox`);
      setPendingOverrides(new Map());
      setShowSaveDialog(false);
      void queryClient.invalidateQueries({ queryKey: guestsQueryKey });
    } catch (err) {
      toast.error(`Failed to apply changes: ${getApiErrorMessage(err)}`);
    } finally {
      setIsSaving(false);
    }
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
    <>
      {/* Pending changes toolbar */}
      {pendingCount > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
          <span className="text-sm text-amber-300">
            <span className="font-semibold">{pendingCount}</span> guest{pendingCount !== 1 ? 's' : ''} with unsaved changes
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleDiscardChanges}
            >
              <Undo2 className="h-3.5 w-3.5" />
              Discard
            </Button>
            <Button
              size="sm"
              className="h-7 gap-1.5 bg-amber-500 text-xs text-black hover:bg-amber-400"
              onClick={() => setShowSaveDialog(true)}
            >
              <Save className="h-3.5 w-3.5" />
              Save changes
            </Button>
          </div>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
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
                  {bandedGuests.map(({ band, guests: bandGuests }) => {
                    if (band === null) {
                      // Ungrouped guests
                      if (bandGuests.length === 0) return null;
                      return bandGuests.map((guest) => {
                        const serverGuest = guests.find((g) => g.vmid === guest.vmid) ?? guest;
                        return (
                          <GuestRow
                            key={`${guest.type}-${guest.vmid}`}
                            guest={serverGuest}
                            displayGuest={guest}
                            hasPendingChanges={pendingOverrides.has(guest.vmid)}
                            onUpdateOnboot={handleOnboot}
                            onUpdateStartup={handleStartup}
                            isDragDisabled={isFiltered}
                          />
                        );
                      });
                    }

                    return [
                      <BootBandRow
                        key={`band-${band}`}
                        value={band}
                        guestCount={bandGuests.length}
                        isOver={overBandValue === band}
                      />,
                      ...bandGuests.map((guest) => {
                        const serverGuest = guests.find((g) => g.vmid === guest.vmid) ?? guest;
                        return (
                          <GuestRow
                            key={`${guest.type}-${guest.vmid}`}
                            guest={serverGuest}
                            displayGuest={guest}
                            hasPendingChanges={pendingOverrides.has(guest.vmid)}
                            onUpdateOnboot={handleOnboot}
                            onUpdateStartup={handleStartup}
                            isDragDisabled={isFiltered}
                          />
                        );
                      }),
                    ];
                  })}
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
              {overBandValue !== null && (
                <span className="ml-1 rounded bg-blue-500/20 px-1.5 py-0.5 text-xs text-blue-300">
                  → order {overBandValue}
                </span>
              )}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <SaveChangesDialog
        open={showSaveDialog}
        onOpenChange={setShowSaveDialog}
        guests={guests}
        overrides={pendingOverrides}
        isSaving={isSaving}
        onConfirm={() => void handleConfirmSave()}
      />
    </>
  );
}
