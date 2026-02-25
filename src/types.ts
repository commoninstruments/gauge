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
  rate_limit_tier: string | null;
}

export interface AccountConfig {
  name: string;
  addedAt: string;
}

export type Plan = "pro" | "max_5x" | "max_20x" | "max" | "unknown";

export interface AccountUsage {
  name: string;
  plan: Plan;
  orgUuid: string;
  usage: UsageResponse;
  error?: string;
}
