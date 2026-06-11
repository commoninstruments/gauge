import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AccountDetails } from "./accounts.js";
import type { Provider, UnifiedAccount } from "./types.js";

export type ProviderGroups = Partial<Record<Provider, UnifiedAccount[]>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readJsonIfExists(filePath: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function decodeJwtPayload(token: string | undefined): Record<string, unknown> {
  if (!token) return {};
  const part = token.split(".")[1];
  if (!part) return {};
  try {
    return JSON.parse(
      Buffer.from(part, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function normalizeName(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return normalized.length > 0 ? normalized : null;
}

function emailCandidates(email: string | undefined): string[] {
  if (!email) return [];
  const [local = "", domain = ""] = email.toLowerCase().split("@");
  const domainRoot = domain.split(".")[0] ?? "";
  return [email, local, domainRoot].filter(Boolean);
}

function candidateSet(values: Array<string | undefined>): Set<string> {
  const set = new Set<string>();
  for (const value of values) {
    const normalized = normalizeName(value);
    if (normalized) set.add(normalized);
  }
  return set;
}

function resolvedPath(value: string | undefined): string | null {
  if (!value) return null;
  const expanded = value.startsWith("~/")
    ? path.join(os.homedir(), value.slice(2))
    : value;
  return path.resolve(expanded);
}

function currentClaudeIdentity(): {
  candidates: Set<string>;
  providerAccountId: string | null;
} {
  const config = readJsonIfExists(path.join(os.homedir(), ".claude.json"));
  if (!isRecord(config)) {
    return { candidates: new Set(), providerAccountId: null };
  }
  const account = isRecord(config.oauthAccount) ? config.oauthAccount : {};
  const email = stringValue(account.emailAddress);
  return {
    candidates: candidateSet([
      ...emailCandidates(email),
      stringValue(account.displayName),
      stringValue(account.organizationName),
    ]),
    providerAccountId: stringValue(account.organizationUuid) ?? null,
  };
}

function currentCodexIdentity(): { candidates: Set<string>; home: string } {
  const home =
    resolvedPath(process.env.CODEX_HOME) ?? path.join(os.homedir(), ".codex");
  const auth = readJsonIfExists(path.join(home, "auth.json"));
  if (!isRecord(auth)) return { candidates: new Set(), home };

  const tokens = isRecord(auth.tokens) ? auth.tokens : {};
  const identity = decodeJwtPayload(
    stringValue(tokens.id_token ?? tokens.idToken),
  );
  const email =
    stringValue(identity.email) ??
    stringValue(identity["https://api.openai.com/auth/email"]);

  return {
    candidates: candidateSet(emailCandidates(email)),
    home,
  };
}

function isCandidateMatch(
  account: UnifiedAccount,
  candidates: Set<string>,
): boolean {
  return [
    normalizeName(account.label),
    normalizeName(account.email),
    ...emailCandidates(account.email).map(normalizeName),
  ].some((value) => value !== null && candidates.has(value));
}

function accountCodexHome(
  account: UnifiedAccount,
  configs: AccountDetails[],
): string | null {
  const config = configs.find(
    (item) => item.provider === "codex" && item.name === account.label,
  );
  return resolvedPath(config?.codexHome);
}

export function markCurrentAccounts(
  groups: ProviderGroups,
  configs: AccountDetails[],
): ProviderGroups {
  const claudeIdentity = currentClaudeIdentity();
  const codexIdentity = currentCodexIdentity();
  const exactClaudeMatch =
    claudeIdentity.providerAccountId && groups.claude
      ? groups.claude.some(
          (account) =>
            account.providerAccountId === claudeIdentity.providerAccountId,
        )
      : false;

  return {
    ...groups,
    ...(groups.claude && {
      claude: groups.claude.map((account) => ({
        ...account,
        current:
          (exactClaudeMatch
            ? account.providerAccountId === claudeIdentity.providerAccountId
            : isCandidateMatch(account, claudeIdentity.candidates)) ||
          undefined,
      })),
    }),
    ...(groups.codex && {
      codex: groups.codex.map((account) => {
        const configuredHome = accountCodexHome(account, configs);
        const homeMatches =
          configuredHome !== null && configuredHome === codexIdentity.home;
        return {
          ...account,
          current:
            homeMatches ||
            isCandidateMatch(account, codexIdentity.candidates) ||
            undefined,
        };
      }),
    }),
  };
}
