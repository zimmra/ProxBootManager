import { AlertCircle, RefreshCw, Server, Wifi, WifiOff } from 'lucide-react';
import type { ProxmoxStatus } from '../types';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

interface StatusHeaderProps {
  status?: ProxmoxStatus;
  isStatusLoading: boolean;
  lastUpdated?: Date;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function StatusHeader({ status, isStatusLoading, lastUpdated, onRefresh, isRefreshing }: StatusHeaderProps) {
  const nodeLabel = status?.node ?? status?.host ?? 'Proxmox node';
  const versionLabel = status?.version ? `Proxmox VE ${status.version}` : 'Proxmox VE';

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 ring-1 ring-blue-400/20">
            <Server className="h-5 w-5 text-blue-300" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-tight text-foreground">ProxBootManager</h1>
            <p className="truncate text-xs text-muted-foreground">
              {status?.connected ? `Connected to ${nodeLabel} (${versionLabel})` : 'Proxmox boot order dashboard'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="hidden text-xs text-muted-foreground md:block">Updated {lastUpdated.toLocaleTimeString()}</span>
          )}
          <StatusChip status={status} isLoading={isStatusLoading} />
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>
    </header>
  );
}

function StatusChip({ status, isLoading }: { status?: ProxmoxStatus; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Badge variant="outline" className="gap-1.5 text-muted-foreground">
        <span className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground" />
        Connecting…
      </Badge>
    );
  }

  if (status?.connected) {
    return (
      <Badge variant="outline" className="gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
        <Wifi className="h-3 w-3" />
        Connected
      </Badge>
    );
  }

  if (status?.configured === false) {
    return (
      <Badge variant="outline" className="gap-1.5 border-amber-400/30 bg-amber-400/10 text-amber-300">
        <AlertCircle className="h-3 w-3" />
        Not configured
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="gap-1.5 border-destructive/40 bg-destructive/10 text-destructive-foreground">
      <WifiOff className="h-3 w-3" />
      Connection error
    </Badge>
  );
}
