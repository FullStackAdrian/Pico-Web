export type Script = {
  id: string;
  name: string;
  content: string;
  tags: string[];
  category: string;
  currentVersion?: number;
  createdAt: string;
  updatedAt: string;
  source: 'pico' | 'local';
};

export type ScriptVersion = {
  id: string;
  scriptId: string;
  version: number;
  content: string;
  tags: string[];
  category: string;
  createdAt: string;
};

export type DiffHunk = {
  type: 'replace' | 'delete' | 'insert';
  oldStart: number;
  oldEnd: number;
  newStart: number;
  newEnd: number;
  oldLines: string[];
  newLines: string[];
};

export type ScriptDiff = {
  old: string;
  new: string;
  changed: boolean;
  hunks: DiffHunk[];
};

export type Execution = {
  id: string;
  jobId?: string;
  scriptId: string;
  scriptName: string;
  scriptVersion?: number | null;
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
  scriptVersion?: number | null;
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

export type AuthPrincipal = {
  id: number;
  username: string;
  role: string;
  permissions: string[];
};

export type SessionInfo = {
  id: string;
  userId: number;
  createdAt: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  ip: string | null;
  userAgent: string | null;
  active: boolean;
};

export type ApiKeyInfo = {
  id: string;
  name: string;
  description: string;
  prefix: string;
  scopes: string[];
  createdAt: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type AdminUser = {
  id: number;
  username: string;
  role: string;
  roles: string[];
  isActive: boolean;
  createdAt: string | null;
};

export type RoleInfo = {
  name: string;
  description: string;
  permissions: string[];
};

export type PermissionInfo = string;

export type AuditEntry = {
  id: number;
  user: string | null;
  apiKeyId: string | null;
  action: string;
  resource: string | null;
  resourceId: string | null;
  success: boolean;
  ip: string | null;
  userAgent: string | null;
  createdAt: string | null;
};

export type AuditPage = {
  entries: AuditEntry[];
  total: number;
  limit: number;
  offset: number;
};
