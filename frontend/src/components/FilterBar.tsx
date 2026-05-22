import { Search, X } from 'lucide-react';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { Button } from './ui/button';
import type { FilterState, FilterType, FilterAutoboot } from '../types';

interface FilterBarProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  totalCount: number;
  filteredCount: number;
}

export function FilterBar({ filters, onChange, totalCount, filteredCount }: FilterBarProps) {
  const isFiltered =
    filters.search !== '' || filters.type !== 'all' || filters.autoboot !== 'all';

  function reset() {
    onChange({ search: '', type: 'all', autoboot: 'all' });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[200px] flex-1">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or VMID…"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          className="pl-8"
        />
      </div>

      <Select
        value={filters.type}
        onChange={(e) => onChange({ ...filters, type: e.target.value as FilterType })}
        className="w-32"
      >
        <option value="all">All types</option>
        <option value="qemu">VM only</option>
        <option value="lxc">LXC only</option>
      </Select>

      <Select
        value={filters.autoboot}
        onChange={(e) => onChange({ ...filters, autoboot: e.target.value as FilterAutoboot })}
        className="w-36"
      >
        <option value="all">All autoboot</option>
        <option value="enabled">Autoboot on</option>
        <option value="disabled">Autoboot off</option>
      </Select>

      {isFiltered && (
        <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5 text-muted-foreground">
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>
      )}

      <span className="ml-auto text-xs text-muted-foreground">
        {filteredCount === totalCount
          ? `${totalCount} guest${totalCount !== 1 ? 's' : ''}`
          : `${filteredCount} of ${totalCount}`}
      </span>
    </div>
  );
}
