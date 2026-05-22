import { useMemo, useState } from 'react';
import { AlertTriangle, Network, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { getApiErrorMessage } from './api/proxmox';
import { FilterBar } from './components/FilterBar';
import { filterGuests, GuestTable } from './components/GuestTable';
import { StatusHeader } from './components/StatusHeader';
import { Alert, AlertDescription, AlertTitle } from './components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { useGuests, useStatus } from './hooks/useProxmox';
import type { FilterState } from './types';

function App() {
  const [filters, setFilters] = useState<FilterState>({ search: '', type: 'all', autoboot: 'all' });
  const statusQuery = useStatus();
  const guestsQuery = useGuests();

  const guests = guestsQuery.data ?? [];
  const filteredCount = useMemo(() => filterGuests(guests, filters).length, [guests, filters]);
  const lastUpdatedAt = Math.max(statusQuery.dataUpdatedAt, guestsQuery.dataUpdatedAt);
  const lastUpdated = lastUpdatedAt ? new Date(lastUpdatedAt) : undefined;
  const statusError = statusQuery.error ? getApiErrorMessage(statusQuery.error) : undefined;
  const connectionError = statusQuery.data?.error ?? statusQuery.data?.connectionError ?? statusError;

  function refreshAll() {
    void statusQuery.refetch();
    void guestsQuery.refetch();
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <StatusHeader
        status={statusQuery.data}
        isStatusLoading={statusQuery.isLoading}
        lastUpdated={lastUpdated}
        onRefresh={refreshAll}
        isRefreshing={statusQuery.isFetching || guestsQuery.isFetching}
      />

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        {connectionError && (
          <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Backend or Proxmox connection error</AlertTitle>
            <AlertDescription>{connectionError}</AlertDescription>
          </Alert>
        )}

        <section className="grid gap-4 md:grid-cols-3">
          <Card className="border-blue-500/20 bg-blue-500/5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Managed guests</CardTitle>
              <Network className="h-4 w-4 text-blue-300" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{guests.length}</div>
              <p className="text-xs text-muted-foreground">VMs and LXCs discovered on the node</p>
            </CardContent>
          </Card>

          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Autoboot enabled</CardTitle>
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{guests.filter((guest) => guest.onboot).length}</div>
              <p className="text-xs text-muted-foreground">Guests configured to start with Proxmox</p>
            </CardContent>
          </Card>

          <Card className="border-purple-500/20 bg-purple-500/5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active filters</CardTitle>
              <SlidersHorizontal className="h-4 w-4 text-purple-300" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{filteredCount}</div>
              <p className="text-xs text-muted-foreground">Rows visible in the boot priority table</p>
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader className="border-b border-border">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle>Boot Manager Dashboard</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Toggle autoboot, tune startup order/delay, and drag rows to reprioritize boot sequence.
                </p>
              </div>
              <FilterBar filters={filters} onChange={setFilters} totalCount={guests.length} filteredCount={filteredCount} />
            </div>
          </CardHeader>
          <CardContent className="p-0 sm:p-4">
            <GuestTable
              guests={guests}
              isLoading={guestsQuery.isLoading}
              error={guestsQuery.error}
              filters={filters}
            />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default App;
