import { Loader2 } from 'lucide-react';
import { parseStartup } from '../api/proxmox';
import type { Guest, PendingOverride } from '../types';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

interface ChangeRow {
  vmid: number;
  name: string;
  fields: Array<{ label: string; from: string; to: string }>;
}

function buildChangeRows(guests: Guest[], overrides: Map<number, PendingOverride>): ChangeRow[] {
  const rows: ChangeRow[] = [];
  for (const [vmid, override] of overrides.entries()) {
    const guest = guests.find((g) => g.vmid === vmid);
    if (!guest) continue;
    const fields: ChangeRow['fields'] = [];

    if (override.onboot !== undefined && override.onboot !== guest.onboot) {
      fields.push({
        label: 'Autoboot',
        from: guest.onboot ? 'enabled' : 'disabled',
        to: override.onboot ? 'enabled' : 'disabled',
      });
    }

    if (override.startup !== undefined && override.startup !== guest.startup) {
      const oldParsed = parseStartup(guest.startup);
      const newParsed = parseStartup(override.startup);
      if (oldParsed.order !== newParsed.order) {
        fields.push({
          label: 'Boot order',
          from: oldParsed.order !== undefined ? String(oldParsed.order) : '–',
          to: newParsed.order !== undefined ? String(newParsed.order) : '–',
        });
      }
      if (oldParsed.up !== newParsed.up) {
        fields.push({
          label: 'Delay (up)',
          from: oldParsed.up !== undefined ? `${oldParsed.up}s` : '–',
          to: newParsed.up !== undefined ? `${newParsed.up}s` : '–',
        });
      }
    }

    if (fields.length > 0) {
      rows.push({ vmid, name: guest.name, fields });
    }
  }
  return rows;
}

interface SaveChangesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guests: Guest[];
  overrides: Map<number, PendingOverride>;
  isSaving: boolean;
  onConfirm: () => void;
}

export function SaveChangesDialog({
  open,
  onOpenChange,
  guests,
  overrides,
  isSaving,
  onConfirm,
}: SaveChangesDialogProps) {
  const changeRows = buildChangeRows(guests, overrides);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply boot configuration changes?</DialogTitle>
          <DialogDescription>
            The following changes will be written to Proxmox. This cannot be undone automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-72 overflow-y-auto rounded-lg border border-border bg-muted/30 text-sm">
          {changeRows.length === 0 ? (
            <p className="px-4 py-3 text-muted-foreground">No changes detected.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-4 py-2 text-left font-medium">Guest</th>
                  <th className="px-4 py-2 text-left font-medium">Field</th>
                  <th className="px-4 py-2 text-left font-medium">From</th>
                  <th className="px-4 py-2 text-left font-medium">To</th>
                </tr>
              </thead>
              <tbody>
                {changeRows.flatMap((row) =>
                  row.fields.map((field, i) => (
                    <tr
                      key={`${row.vmid}-${field.label}`}
                      className="border-b border-border/50 last:border-0"
                    >
                      {i === 0 ? (
                        <td
                          className="px-4 py-2 align-top font-mono text-xs text-muted-foreground"
                          rowSpan={row.fields.length}
                        >
                          <span className="block">{row.name}</span>
                          <span className="text-[10px] opacity-60">{row.vmid}</span>
                        </td>
                      ) : null}
                      <td className="px-4 py-2 text-muted-foreground">{field.label}</td>
                      <td className="px-4 py-2 text-red-400/80 line-through">{field.from}</td>
                      <td className="px-4 py-2 font-medium text-emerald-400">{field.to}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isSaving || changeRows.length === 0}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Applying…
              </>
            ) : (
              `Apply ${changeRows.length} change${changeRows.length !== 1 ? 's' : ''}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
