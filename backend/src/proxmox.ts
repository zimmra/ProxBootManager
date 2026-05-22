import { PveClient } from '@corsinvest/cv4pve-api-javascript';

export interface VMInfo {
  vmid: number;
  name: string;
  status: string;
  type: 'qemu' | 'lxc';
}

export interface GuestConfig {
  onboot?: number;
  startup?: string;
  [key: string]: unknown;
}

interface PveResult {
  isSuccessStatusCode: boolean;
  statusCode: number;
  reasonPhrase: string;
  response: { data?: unknown; errors?: Record<string, string> };
}

function assertOk(result: PveResult): void {
  if (!result.isSuccessStatusCode) {
    const errors = result.response?.errors;
    const detail = errors ? Object.values(errors).join('; ') : result.reasonPhrase;
    const err = new Error(detail) as Error & { status: number };
    err.status = result.statusCode;
    throw err;
  }
}

export class ProxmoxClient {
  private client: PveClient;
  private node: string;

  constructor() {
    const host = process.env.PROXMOX_HOST || '';
    const tokenId = process.env.PROXMOX_TOKEN_ID || '';
    const tokenSecret = process.env.PROXMOX_TOKEN_SECRET || '';
    this.node = process.env.PROXMOX_NODE || '';

    this.client = new PveClient(host, 8006);
    // Token format: USER@REALM!TOKENID=SECRET
    this.client.apiToken = `${tokenId}=${tokenSecret}`;
  }

  getConfiguredNode(): string {
    return this.node;
  }

  isConfigured(): boolean {
    return !!(
      process.env.PROXMOX_HOST &&
      process.env.PROXMOX_TOKEN_ID &&
      process.env.PROXMOX_TOKEN_SECRET &&
      process.env.PROXMOX_NODE
    );
  }

  async getNodes(): Promise<unknown[]> {
    const result = await this.client.nodes.index() as PveResult;
    assertOk(result);
    return result.response.data as unknown[];
  }

  async getVMs(node: string): Promise<VMInfo[]> {
    const result = await this.client.nodes.get(node).qemu.vmlist(false) as PveResult;
    assertOk(result);
    return (result.response.data as VMInfo[]).map((vm) => ({ ...vm, type: 'qemu' as const }));
  }

  async getLXCs(node: string): Promise<VMInfo[]> {
    const result = await this.client.nodes.get(node).lxc.vmlist() as PveResult;
    assertOk(result);
    return (result.response.data as VMInfo[]).map((ct) => ({ ...ct, type: 'lxc' as const }));
  }

  async getVMConfig(node: string, vmid: number): Promise<GuestConfig> {
    const result = await this.client.get(`/nodes/${node}/qemu/${vmid}/config`) as PveResult;
    assertOk(result);
    return result.response.data as GuestConfig;
  }

  async getLXCConfig(node: string, vmid: number): Promise<GuestConfig> {
    const result = await this.client.get(`/nodes/${node}/lxc/${vmid}/config`) as PveResult;
    assertOk(result);
    return result.response.data as GuestConfig;
  }

  async updateVMConfig(node: string, vmid: number, data: Record<string, unknown>): Promise<void> {
    const result = await this.client.set(`/nodes/${node}/qemu/${vmid}/config`, data) as PveResult;
    assertOk(result);
  }

  async updateLXCConfig(node: string, vmid: number, data: Record<string, unknown>): Promise<void> {
    const result = await this.client.set(`/nodes/${node}/lxc/${vmid}/config`, data) as PveResult;
    assertOk(result);
  }
}

export const proxmox = new ProxmoxClient();
