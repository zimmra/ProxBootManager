import { useDroppable } from '@dnd-kit/core';
import { TableCell, TableRow } from './ui/table';

export type BandVariant = 'predefined' | 'dynamic' | 'unordered';

interface BootBandRowProps {
  value: number | 'unordered';
  variant: BandVariant;
  guestCount: number;
  isOver: boolean;
}

export function bandDropId(value: number | 'unordered') {
  return `band-${value}`;
}

export function BootBandRow({ value, variant, guestCount, isOver }: BootBandRowProps) {
  const { setNodeRef } = useDroppable({ id: bandDropId(value) });

  const isUnordered = variant === 'unordered';
  const isDynamic = variant === 'dynamic';

  const rowClass = [
    'select-none border-y transition-colors',
    isOver
      ? 'border-blue-500/60 bg-blue-500/15'
      : isUnordered
        ? 'border-dashed border-border/30 bg-muted/10 hover:bg-muted/20'
        : isDynamic
          ? 'border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10'
          : 'border-border/40 bg-muted/20 hover:bg-muted/30',
  ].join(' ');

  const badgeClass = isOver
    ? 'bg-blue-500/30 text-blue-300 ring-1 ring-blue-500/50'
    : isUnordered
      ? 'bg-slate-700/40 text-slate-400'
      : isDynamic
        ? 'bg-amber-900/50 text-amber-300'
        : 'bg-slate-700/60 text-slate-300';

  const label = isUnordered ? 'Unordered' : `Order ${value}`;

  const hint = isOver
    ? isUnordered
      ? 'Release to remove boot order'
      : `Release to assign order ${value}`
    : guestCount === 0
      ? isUnordered
        ? 'Guests with no boot order will appear here'
        : 'Drop here to assign order'
      : `${guestCount} guest${guestCount !== 1 ? 's' : ''}`;

  return (
    <TableRow ref={setNodeRef} className={rowClass}>
      <TableCell colSpan={8} className="py-1.5">
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-bold tabular-nums ${badgeClass}`}>
            {label}
          </span>

          {isDynamic && !isOver && (
            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
              custom
            </span>
          )}

          <span className="text-xs text-muted-foreground">{hint}</span>

          {isOver && (
            <span
              className={`ml-auto text-xs font-medium ${
                isUnordered ? 'text-slate-300' : 'text-blue-400'
              }`}
            >
              {hint}
            </span>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
