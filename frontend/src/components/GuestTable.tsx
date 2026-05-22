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
import type { FilterState, Guest, NormalizedGuestType, PendingOverride } from '../types';
import { BOOT_BANDS } from '../types';
import { BootBandRow, bandDropId } from './BootBandRow';
import type { BandVariant } from './BootBandRow';
import { GuestRow } from './GuestRow';
import type { BandOption } from './GuestRow';
import { SaveChangesDialog } from './SaveChangesDialog';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { guestsQueryKey } from '../hooks/useProxmox';

const PREDEFINED_SET = new Set<number>(BOOT_BANDS);

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

interface BandInfo {
  value: number;
  variant: BandVariant;
}

interface GuestTableProps {
  guests: Guest[];
  isLoading: boolean;
  error: Error | null;
  filters: FilterState;
}

export function GuestTable({ guests, isLoading, error, filters }: GuestTableProps) {
  const queryClient = useQueryClient();

  const [orderedIds, setOrderedIds] = useState<number[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [overBandValue, setOverBandValue] = useState<number | 'unordered' | null>(null);

  const [pendingOverrides, setPendingOverrides] = useState<Map<number, PendingOverride>>(new Map());
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [bandLabels, setBandLabels] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem('proxboot-band-labels');
      return stored ? (JSON.parse(stored) as Record<string, string>) : {};
    } catch {
      return {};
    }
  });

  const isFiltered = filters.search !== '' || filters.type !== 'all' || filters.autoboot !== 'all';
  const pendingCount = pendingOverrides.size;

  // Sync orderedIds when server data refreshes (not during drag)
  useEffect(() => {
    if (activeId !== null) return;
    const withDisplay = guests.map((g) => ({
      ...g,
      startup: pendingOverrides.get(g.vmid)?.startup ?? g.startup,
    }));
    const sorted = [...withDisplay].sort((a, b) => {
      const oA = parseStartup(a.startup).order ?? Number.POSITIVE_INFINITY;
      const oB = parseStartup(b.startup).order ?? Number.POSITIVE_INFINITY;
      return oA !== oB ? oA - oB : a.vmid - b.vmid;
    });
    setOrderedIds(sorted.map((g) => g.vmid));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guests]);

  // Server data merged with pending overrides
  const displayGuests = useMemo(
    () =>
      guests.map((g) => {
        const ov = pendingOverrides.get(g.vmid);
        if (!ov) return g;
        return { ...g, onboot: ov.onboot ?? g.onboot, startup: ov.startup ?? g.startup };
      }),
    [guests, pendingOverrides],
  );

  // All bands: predefined (always) + dynamic (from any non-predefined order values present in displayGuests)
  const allBands = useMemo((): BandInfo[] => {
    const dynamicValues = new Set<number>();
    for (const g of displayGuests) {
      const order = parseStartup(g.startup).order;
      if (order !== undefined && !PREDEFINED_SET.has(order)) {
        dynamicValues.add(order);
      }
    }
    const combined = [...new Set([...BOOT_BANDS, ...dynamicValues])].sort((a, b) => a - b);
    return combined.map((v) => ({ value: v, variant: PREDEFINED_SET.has(v) ? 'predefined' : 'dynamic' }));
  }, [displayGuests]);

  // Band options for the order dropdown in each guest row
  const bandOptions = useMemo(
    (): BandOption[] =>
      allBands.map((b) => ({
        value: b.value,
        label: bandLabels[String(b.value)]
          ? `${bandLabels[String(b.value)]} (${b.value})`
          : `Order ${b.value}`,
      })),
    [allBands, bandLabels],
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

  // Group filtered guests by exact order value; collect unordered separately
  const { bandRows, unorderedGuests } = useMemo(() => {
    const orderMap = new Map<number, Guest[]>();
    const unordered: Guest[] = [];
    for (const g of filteredGuests) {
      const order = parseStartup(g.startup).order;
      if (order === undefined) {
        unordered.push(g);
      } else {
        if (!orderMap.has(order)) orderMap.set(order, []);
        orderMap.get(order)!.push(g);
      }
    }
    return {
      bandRows: allBands.map((b) => ({ ...b, guests: orderMap.get(b.value) ?? [] })),
      unorderedGuests: unordered,
    };
  }, [filteredGuests, allBands]);

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

  function handleBandLabelChange(value: number | 'unordered', label: string) {
    setBandLabels((prev) => {
      const key = String(value);
      const next = { ...prev };
      if (label) next[key] = label;
      else delete next[key];
      localStorage.setItem('proxboot-band-labels', JSON.stringify(next));
      return next;
    });
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(Number(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    if (!event.over) { setOverBandValue(null); return; }
    const overId = String(event.over.id);
    if (overId === bandDropId('unordered')) {
      setOverBandValue('unordered');
    } else if (overId.startsWith('band-')) {
      const val = parseInt(overId.replace('band-', ''), 10);
      setOverBandValue(isNaN(val) ? null : val);
    } else {
      // Hovering over a guest row — highlight the band that guest belongs to
      const overVmid = Number(overId);
      const overGuest = displayGuests.find((g) => g.vmid === overVmid);
      if (overGuest) {
        const order = parseStartup(overGuest.startup).order;
        setOverBandValue(order !== undefined ? order : 'unordered');
      } else {
        setOverBandValue(null);
      }
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    setOverBandValue(null);
    const { active, over } = event;
    if (!over) return;

    const activeVmid = Number(active.id);
    const overIdStr = String(over.id);

    // Dropped on the Unordered band → remove order from startup
    if (overIdStr === bandDropId('unordered')) {
      const serverGuest = guests.find((g) => g.vmid === activeVmid);
      if (serverGuest) {
        const currentStartup = pendingOverrides.get(activeVmid)?.startup ?? serverGuest.startup;
        const newStartup = formatStartup({ ...parseStartup(currentStartup), order: undefined });
        setPendingStartup(activeVmid, newStartup);
        setOrderedIds((prev) => [...prev.filter((id) => id !== activeVmid), activeVmid]);
      }
      return;
    }

    // Dropped on a numbered band header → assign that order value
    if (overIdStr.startsWith('band-')) {
      const bandValue = parseInt(overIdStr.replace('band-', ''), 10);
      if (!isNaN(bandValue)) {
        const serverGuest = guests.find((g) => g.vmid === activeVmid);
        if (serverGuest) {
          const currentStartup = pendingOverrides.get(activeVmid)?.startup ?? serverGuest.startup;
          const newStartup = formatStartup({ ...parseStartup(currentStartup), order: bandValue });
          setPendingStartup(activeVmid, newStartup);
          setOrderedIds((prev) => {
            const withoutActive = prev.filter((id) => id !== activeVmid);
            const sorted = [...withoutActive].sort((a, b) => {
              const aG = displayGuests.find((g) => g.vmid === a);
              const bG = displayGuests.find((g) => g.vmid === b);
              const oA = parseStartup(aG?.startup ?? '').order ?? Number.POSITIVE_INFINITY;
              const oB = parseStartup(bG?.startup ?? '').order ?? Number.POSITIVE_INFINITY;
              return oA - oB;
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

    // Dropped on another guest row → assign to that guest's band (no full reorder)
    if (active.id !== over.id) {
      const overVmid = Number(overIdStr);
      if (!isNaN(overVmid) && overVmid > 0) {
        const serverGuest = guests.find((g) => g.vmid === activeVmid);
        const overGuest = displayGuests.find((g) => g.vmid === overVmid);
        if (serverGuest && overGuest) {
          const targetOrder = parseStartup(overGuest.startup).order;
          const currentStartup = pendingOverrides.get(activeVmid)?.startup ?? serverGuest.startup;
          const newStartup = formatStartup({ ...parseStartup(currentStartup), order: targetOrder });
          if (newStartup !== currentStartup) {
            setPendingStartup(activeVmid, newStartup);
          }
          // Place active item next to the target in orderedIds
          setOrderedIds((prev) => {
            const withoutActive = prev.filter((id) => id !== activeVmid);
            const targetIdx = withoutActive.indexOf(overVmid);
            if (targetIdx === -1) return [...withoutActive, activeVmid];
            const result = [...withoutActive];
            result.splice(targetIdx + 1, 0, activeVmid);
            return result;
          });
        }
      }
    }
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

  function renderGuestRow(guest: Guest) {
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
        bandOptions={bandOptions}
      />
    );
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

  const overlayBandLabel =
    overBandValue === 'unordered'
      ? 'Unordered'
      : overBandValue !== null
        ? bandLabels[String(overBandValue)] ?? `order ${overBandValue}`
        : null;

  return (
    <>
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
                <TableHead className="w-32">Order</TableHead>
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
                  {/* Numbered bands (predefined + dynamic, sorted) */}
                  {bandRows.map(({ value, variant, guests: bandGuests }) => [
                    <BootBandRow
                      key={`band-${value}`}
                      value={value}
                      variant={variant}
                      guestCount={bandGuests.length}
                      isOver={overBandValue === value}
                      label={bandLabels[String(value)]}
                      onLabelChange={(lbl) => handleBandLabelChange(value, lbl)}
                    />,
                    ...bandGuests.map(renderGuestRow),
                  ])}

                  {/* Unordered band — always shown at the bottom */}
                  <BootBandRow
                    key="band-unordered"
                    value="unordered"
                    variant="unordered"
                    guestCount={unorderedGuests.length}
                    isOver={overBandValue === 'unordered'}
                  />
                  {unorderedGuests.map(renderGuestRow)}
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
              {overlayBandLabel !== null && (
                <span
                  className={`ml-1 rounded px-1.5 py-0.5 text-xs ${
                    overBandValue === 'unordered'
                      ? 'bg-slate-500/20 text-slate-300'
                      : 'bg-blue-500/20 text-blue-300'
                  }`}
                >
                  → {overlayBandLabel}
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
