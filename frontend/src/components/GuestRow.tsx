import { useEffect, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { TableRow, TableCell } from './ui/table';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Input } from './ui/input';
import { parseStartup, formatStartup } from '../api/proxmox';
import type { Guest, NormalizedGuestType } from '../types';

interface GuestRowProps {
  guest: Guest;
  displayGuest: Guest;
  hasPendingChanges: boolean;
  onUpdateOnboot: (vmid: number, type: NormalizedGuestType, onboot: boolean) => void;
  onUpdateStartup: (vmid: number, type: NormalizedGuestType, startup: string) => void;
  isDragDisabled?: boolean;
}

export function GuestRow({
  guest,
  displayGuest,
  hasPendingChanges,
  onUpdateOnboot,
  onUpdateStartup,
  isDragDisabled = false,
}: GuestRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: guest.vmid, disabled: isDragDisabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const parsed = parseStartup(displayGuest.startup);
  const [orderVal, setOrderVal] = useState(parsed.order !== undefined ? String(parsed.order) : '');
  const [upVal, setUpVal] = useState(parsed.up !== undefined ? String(parsed.up) : '');

  const prevStartup = useRef(displayGuest.startup);
  useEffect(() => {
    if (displayGuest.startup !== prevStartup.current) {
      prevStartup.current = displayGuest.startup;
      const p = parseStartup(displayGuest.startup);
      setOrderVal(p.order !== undefined ? String(p.order) : '');
      setUpVal(p.up !== undefined ? String(p.up) : '');
    }
  }, [displayGuest.startup]);

  function commitOrder(raw: string) {
    const p = parseStartup(displayGuest.startup);
    const num = raw === '' ? undefined : parseInt(raw, 10);
    if (raw !== '' && (isNaN(num as number) || (num as number) < 0)) return;
    const next = formatStartup({ ...p, order: num });
    if (next !== displayGuest.startup) onUpdateStartup(guest.vmid, guest.type, next);
  }

  function commitUp(raw: string) {
    const p = parseStartup(displayGuest.startup);
    const num = raw === '' ? undefined : parseInt(raw, 10);
    if (raw !== '' && (isNaN(num as number) || (num as number) < 0)) return;
    const next = formatStartup({ ...p, up: num });
    if (next !== displayGuest.startup) onUpdateStartup(guest.vmid, guest.type, next);
  }

  const isRunning = guest.status === 'running';

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={`transition-colors ${isDragging ? 'z-50 shadow-lg' : ''} ${
        hasPendingChanges ? 'bg-amber-500/5 ring-1 ring-inset ring-amber-500/20' : ''
      }`}
      {...attributes}
    >
      {/* VMID */}
      <TableCell className="w-16 font-mono text-xs text-muted-foreground">
        {guest.vmid}
        {hasPendingChanges && (
          <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-400" title="Unsaved changes" />
        )}
      </TableCell>

      {/* Name */}
      <TableCell className="max-w-[200px]">
        <span className="truncate block font-medium">{guest.name}</span>
      </TableCell>

      {/* Type */}
      <TableCell className="w-20">
        <TypeBadge type={guest.type} />
      </TableCell>

      {/* Status */}
      <TableCell className="w-24">
        <span className="flex items-center gap-1.5 text-xs">
          <span
            className={`h-2 w-2 rounded-full ${isRunning ? 'bg-emerald-400' : 'bg-slate-500'}`}
          />
          <span className={isRunning ? 'text-emerald-400' : 'text-muted-foreground'}>
            {isRunning ? 'Running' : 'Stopped'}
          </span>
        </span>
      </TableCell>

      {/* Autoboot */}
      <TableCell className="w-20">
        <Switch
          checked={displayGuest.onboot}
          onCheckedChange={(v) => onUpdateOnboot(guest.vmid, guest.type, v)}
        />
      </TableCell>

      {/* Boot Order */}
      <TableCell className="w-20">
        <Input
          type="number"
          min={0}
          value={orderVal}
          onChange={(e) => setOrderVal(e.target.value)}
          onBlur={() => commitOrder(orderVal)}
          onKeyDown={(e) => e.key === 'Enter' && commitOrder(orderVal)}
          placeholder="–"
          className="h-7 w-16 pr-1 text-center text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </TableCell>

      {/* Boot Delay (up) */}
      <TableCell className="w-20">
        <Input
          type="number"
          min={0}
          value={upVal}
          onChange={(e) => setUpVal(e.target.value)}
          onBlur={() => commitUp(upVal)}
          onKeyDown={(e) => e.key === 'Enter' && commitUp(upVal)}
          placeholder="–"
          className="h-7 w-16 pr-1 text-center text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </TableCell>

      {/* Drag Handle */}
      <TableCell className="w-10">
        <button
          ref={setActivatorNodeRef}
          {...listeners}
          className={`flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${
            isDragDisabled ? 'cursor-not-allowed opacity-30' : 'cursor-grab active:cursor-grabbing'
          }`}
          title={isDragDisabled ? 'Clear filters to reorder' : 'Drag to reorder'}
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </TableCell>
    </TableRow>
  );
}

function TypeBadge({ type }: { type: NormalizedGuestType }) {
  if (type === 'lxc') {
    return (
      <Badge variant="outline" className="border-purple-500/30 bg-purple-500/10 text-purple-400">
        LXC
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-400">
      VM
    </Badge>
  );
}
