import axios, { AxiosInstance } from 'axios';
import https from 'https';

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

export class ProxmoxClient {
  private client: AxiosInstance;
  private node: string;

  constructor() {
    const host = process.env.PROXMOX_HOST;
    const tokenId = process.env.PROXMOX_TOKEN_ID;
    const tokenSecret = process.env.PROXMOX_TOKEN_SECRET;
    const verifySSL = process.env.VERIFY_SSL !== 'false';

    this.node = process.env.PROXMOX_NODE || '';

    this.client = axios.create({
      baseURL: `https://${host}:8006/api2/json`,
      headers: {
        Authorization: `PVEAPIToken=${tokenId}=${tokenSecret}`,
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: verifySSL }),
    });
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
    const res = await this.client.get('/nodes');
    return res.data.data;
  }

  async getVMs(node: string): Promise<VMInfo[]> {
    const res = await this.client.get(`/nodes/${node}/qemu`);
    return (res.data.data as VMInfo[]).map((vm) => ({ ...vm, type: 'qemu' as const }));
  }

  async getLXCs(node: string): Promise<VMInfo[]> {
    const res = await this.client.get(`/nodes/${node}/lxc`);
    return (res.data.data as VMInfo[]).map((ct) => ({ ...ct, type: 'lxc' as const }));
  }

  async getVMConfig(node: string, vmid: number): Promise<GuestConfig> {
    const res = await this.client.get(`/nodes/${node}/qemu/${vmid}/config`);
    return res.data.data;
  }

  async getLXCConfig(node: string, vmid: number): Promise<GuestConfig> {
    const res = await this.client.get(`/nodes/${node}/lxc/${vmid}/config`);
    return res.data.data;
  }

  async updateVMConfig(node: string, vmid: number, data: Record<string, unknown>): Promise<void> {
    await this.client.put(`/nodes/${node}/qemu/${vmid}/config`, data);
  }

  async updateLXCConfig(node: string, vmid: number, data: Record<string, unknown>): Promise<void> {
    await this.client.put(`/nodes/${node}/lxc/${vmid}/config`, data);
  }
}

export const proxmox = new ProxmoxClient();
