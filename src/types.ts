export interface UsageLimit {
  resets_at: string;
  utilization: number;
}

export interface UsageResponse {
  extra_usage: unknown;
  five_hour: UsageLimit | null;
  iguana_necktie: UsageLimit | null;
  seven_day: UsageLimit | null;
  seven_day_cowork: UsageLimit | null;
  seven_day_oauth_apps: UsageLimit | null;
  seven_day_opus: UsageLimit | null;
  seven_day_sonnet: UsageLimit | null;
}

export interface Organization {
  capabilities: string[];
  id: number;
  name: string;
  rate_limit_tier: string | null;
  uuid: string;
}

export interface AccountConfig {
  addedAt: string;
  name: string;
}

export type Plan = "pro" | "max_5x" | "max_20x" | "max" | "unknown";

export interface AccountUsage {
  error?: string;
  name: string;
  orgUuid: string;
  plan: Plan;
  usage: UsageResponse;
}
