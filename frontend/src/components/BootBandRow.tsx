import { useDroppable } from '@dnd-kit/core';
import { TableCell, TableRow } from './ui/table';

interface BootBandRowProps {
  value: number;
  guestCount: number;
  isOver: boolean;
}

export function bandDropId(value: number) {
  return `band-${value}`;
}

export function BootBandRow({ value, guestCount, isOver }: BootBandRowProps) {
  const { setNodeRef } = useDroppable({ id: bandDropId(value) });

  return (
    <TableRow
      ref={setNodeRef}
      className={`select-none border-y transition-colors ${
        isOver
          ? 'border-blue-500/60 bg-blue-500/15'
          : 'border-border/40 bg-muted/20 hover:bg-muted/30'
      }`}
    >
      <TableCell colSpan={8} className="py-1.5">
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-bold tabular-nums ${
              isOver
                ? 'bg-blue-500/30 text-blue-300 ring-1 ring-blue-500/50'
                : 'bg-slate-700/60 text-slate-300'
            }`}
          >
            Order {value}
          </span>
          <span className="text-xs text-muted-foreground">
            {guestCount === 0
              ? 'Drop here to assign order'
              : `${guestCount} guest${guestCount !== 1 ? 's' : ''}`}
          </span>
          {isOver && (
            <span className="ml-auto text-xs font-medium text-blue-400">
              Release to assign order {value}
            </span>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
