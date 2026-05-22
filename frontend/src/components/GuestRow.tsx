import { useEffect, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Loader2 } from 'lucide-react';
import { TableRow, TableCell } from './ui/table';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Input } from './ui/input';
import { parseStartup, formatStartup } from '../api/proxmox';
import type { Guest, NormalizedGuestType } from '../types';

interface GuestRowProps {
  guest: Guest;
  isOnbootPending: boolean;
  isStartupPending: boolean;
  onUpdateOnboot: (vmid: number, type: NormalizedGuestType, onboot: boolean) => void;
  onUpdateStartup: (vmid: number, type: NormalizedGuestType, startup: string) => void;
  isDragDisabled?: boolean;
}

export function GuestRow({
  guest,
  isOnbootPending,
  isStartupPending,
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

  const parsed = parseStartup(guest.startup);
  const [orderVal, setOrderVal] = useState(parsed.order !== undefined ? String(parsed.order) : '');
  const [upVal, setUpVal] = useState(parsed.up !== undefined ? String(parsed.up) : '');

  const prevStartup = useRef(guest.startup);
  useEffect(() => {
    if (guest.startup !== prevStartup.current) {
      prevStartup.current = guest.startup;
      const p = parseStartup(guest.startup);
      setOrderVal(p.order !== undefined ? String(p.order) : '');
      setUpVal(p.up !== undefined ? String(p.up) : '');
    }
  }, [guest.startup]);

  function commitOrder(raw: string) {
    const p = parseStartup(guest.startup);
    const num = raw === '' ? undefined : parseInt(raw, 10);
    if (raw !== '' && (isNaN(num as number) || (num as number) < 0)) return;
    const next = formatStartup({ ...p, order: num });
    if (next !== guest.startup) onUpdateStartup(guest.vmid, guest.type, next);
  }

  function commitUp(raw: string) {
    const p = parseStartup(guest.startup);
    const num = raw === '' ? undefined : parseInt(raw, 10);
    if (raw !== '' && (isNaN(num as number) || (num as number) < 0)) return;
    const next = formatStartup({ ...p, up: num });
    if (next !== guest.startup) onUpdateStartup(guest.vmid, guest.type, next);
  }

  const isRunning = guest.status === 'running';

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={isDragging ? 'z-50 shadow-lg' : ''}
      {...attributes}
    >
      {/* VMID */}
      <TableCell className="w-16 font-mono text-xs text-muted-foreground">
        {guest.vmid}
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
        <div className="flex items-center gap-1.5">
          {isOnbootPending ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Switch
              checked={guest.onboot}
              onCheckedChange={(v) => onUpdateOnboot(guest.vmid, guest.type, v)}
              disabled={isOnbootPending}
            />
          )}
        </div>
      </TableCell>

      {/* Boot Order */}
      <TableCell className="w-20">
        <div className="relative">
          {isStartupPending && (
            <Loader2 className="absolute right-1 top-2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
          <Input
            type="number"
            min={0}
            value={orderVal}
            onChange={(e) => setOrderVal(e.target.value)}
            onBlur={() => commitOrder(orderVal)}
            onKeyDown={(e) => e.key === 'Enter' && commitOrder(orderVal)}
            placeholder="–"
            className="h-7 w-16 pr-1 text-center text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            disabled={isStartupPending}
          />
        </div>
      </TableCell>

      {/* Boot Delay (up) */}
      <TableCell className="w-20">
        <div className="relative">
          <Input
            type="number"
            min={0}
            value={upVal}
            onChange={(e) => setUpVal(e.target.value)}
            onBlur={() => commitUp(upVal)}
            onKeyDown={(e) => e.key === 'Enter' && commitUp(upVal)}
            placeholder="–"
            className="h-7 w-16 pr-1 text-center text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            disabled={isStartupPending}
          />
        </div>
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
