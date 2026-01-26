export interface UsageLimit {
  utilization: number;
  resets_at: string;
}

export interface UsageResponse {
  five_hour: UsageLimit | null;
  seven_day: UsageLimit | null;
  seven_day_oauth_apps: UsageLimit | null;
  seven_day_opus: UsageLimit | null;
  seven_day_sonnet: UsageLimit | null;
  seven_day_cowork: UsageLimit | null;
  iguana_necktie: UsageLimit | null;
  extra_usage: unknown;
}

export interface Organization {
  id: number;
  uuid: string;
  name: string;
  capabilities: string[];
}

export interface AccountConfig {
  name: string;
  addedAt: string;
}

export interface AccountUsage {
  name: string;
  plan: "pro" | "max" | "unknown";
  orgUuid: string;
  usage: UsageResponse;
  error?: string;
}
