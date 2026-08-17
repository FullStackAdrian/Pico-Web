export type Script = {
  id: string;
  name: string;
  content: string;
  tags: string[];
  category: string;
  createdAt: string;
  updatedAt: string;
  source: 'pico' | 'local';
};

export type Execution = {
  id: string;
  jobId?: string;
  scriptId: string;
  scriptName: string;
  startedAt: string;
  durationMs: number;
  success: boolean;
  error?: string;
};

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type Job = {
  id: string;
  scriptId: string;
  deviceId?: string | null;
  status: JobStatus;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  error?: string | null;
};

export type Device = {
  id: string;
  name: string;
  picoUrl: string;
  apiUrl: string;
  status: 'online' | 'offline' | 'unknown';
  lastSeen?: string | null;
  firmware?: string | null;
  groupName?: string | null;
  tags?: string[];
  metrics?: {
    uptime_seconds?: number;
    free_memory?: number;
    temperature_c?: number;
    wifi_rssi?: number;
  };
};

export type Payload = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  scriptId?: string;
};

export type AppState = {
  scripts: Script[];
  executions: Execution[];
  payloads: Payload[];
  devices: Device[];
  activeDeviceId: string;
};
