import process from "node:process";
import readline from "node:readline";
import chalk from "chalk";
import { listAccountDetails } from "./accounts.js";
import { addAccount, addCursorAccount, fetchAllUsage } from "./api.js";
import { markCurrentAccounts } from "./current-account.js";
import {
  buildGrid,
  claudeToUnified,
  formatInteractiveDashboard,
  type GridRow,
  type ProviderGroups,
} from "./display.js";
import { fetchCodexAccounts, fetchCursorAccounts } from "./provider-usage.js";

const INDENT = "   ";

async function fetchAllGroups(): Promise<ProviderGroups> {
  const allConfigs = listAccountDetails();
  const codexConfigs = allConfigs.filter(
    (account) => account.provider === "codex",
  );
  const cursorConfigs = allConfigs.filter(
    (account) => account.provider === "cursor",
  );
  const [codex, cursor] = await Promise.all([
    fetchCodexAccounts(codexConfigs),
    fetchCursorAccounts(cursorConfigs),
  ]);
  const claudeConfigs = allConfigs.filter(
    (account) => account.provider === "claude",
  );
  const claudeRaw =
    claudeConfigs.length > 0
      ? await fetchAllUsage(
          claudeConfigs.map((account) => ({
            authKey: account.authKey,
            name: account.name,
          })),
          { quiet: true },
        )
      : [];
  const claude = claudeRaw.map(claudeToUnified);
  return markCurrentAccounts(
    {
      ...(claude.length > 0 && { claude }),
      ...(codex.length > 0 && { codex }),
      ...(cursor.length > 0 && { cursor }),
    },
    allConfigs,
  );
}

export async function runTUI(): Promise<void> {
  let groups: ProviderGroups = {};
  let rows: GridRow[] = [];
  let selectedIndex = 0;
  let statusMessage: string | null = null;
  let isProcessing = false;
  let lastLineCount = 0;

  function writeLines(content: string): void {
    if (lastLineCount > 0) {
      process.stdout.write(`\x1b[${lastLineCount}A\x1b[0J`);
    }
    process.stdout.write(content);
    lastLineCount = (content.match(/\n/g) ?? []).length;
  }

  writeLines(
    `\n${INDENT}${chalk.bold("gauge")}  ${chalk.dim("·  loading...")}\n\n`,
  );

  groups = await fetchAllGroups();
  rows = buildGrid(groups);

  function redraw(): void {
    writeLines(
      formatInteractiveDashboard(groups, rows, selectedIndex, statusMessage),
    );
  }

  async function reloadValues(message = "Refreshing..."): Promise<void> {
    const selectedLabel = rows[selectedIndex]?.label;
    statusMessage = message;
    redraw();
    groups = await fetchAllGroups();
    rows = buildGrid(groups);
    selectedIndex = Math.max(
      0,
      selectedLabel
        ? rows.findIndex((row) => row.label === selectedLabel)
        : selectedIndex,
    );
    if (selectedIndex < 0) selectedIndex = 0;
    selectedIndex = Math.min(selectedIndex, Math.max(0, rows.length - 1));
    statusMessage = null;
    redraw();
  }

  redraw();

  if (!process.stdin.isTTY) return;

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);

  const onKeypress = async (
    _str: string,
    key: { name: string; ctrl: boolean },
  ): Promise<void> => {
    if (!key) return;

    if ((key.ctrl && key.name === "c") || key.name === "q") {
      cleanup();
      process.exit(0);
    }

    if (isProcessing) return;

    if (key.name === "up" || key.name === "k") {
      selectedIndex = Math.max(0, selectedIndex - 1);
      redraw();
      return;
    }

    if (key.name === "down" || key.name === "j") {
      selectedIndex = Math.min(rows.length - 1, selectedIndex + 1);
      redraw();
      return;
    }

    if (key.name === "r") {
      isProcessing = true;
      await reloadValues();
      isProcessing = false;
      return;
    }

    if (key.name === "return") {
      const row = rows[selectedIndex];
      if (row?.claude?.error != null || row?.cursor?.error != null) {
        isProcessing = true;
        await doRefresh(row);
        isProcessing = false;
      }
    }
  };

  process.stdin.on("keypress", onKeypress);

  async function doRefresh(row: GridRow): Promise<void> {
    process.stdin.setRawMode(false);
    const provider = row.claude?.error ? "claude" : "cursor";
    statusMessage = `Opening browser for ${provider}:${row.label} — log in and close the tab...`;
    redraw();

    const account = listAccountDetails(provider).find(
      (item) => item.name === row.label,
    );
    const ok =
      provider === "claude"
        ? await addAccount(row.label, {
            authKey: account?.authKey,
            quiet: true,
          })
        : await addCursorAccount(row.label, {
            authKey: account?.authKey,
            quiet: true,
          });

    if (ok) {
      await reloadValues("Reloading...");
    } else {
      statusMessage = `Re-auth failed for ${row.label}  ·  enter to retry`;
    }

    process.stdin.setRawMode(true);
    redraw();
  }

  function cleanup(): void {
    process.stdin.setRawMode(false);
    process.stdin.off("keypress", onKeypress);
    process.stdout.write("\n");
  }
}
