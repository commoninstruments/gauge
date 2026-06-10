import process from "node:process";
import readline from "node:readline";
import { addAccount, fetchAllUsage } from "./api.js";
import { listAccountDetails } from "./accounts.js";
import { fetchCodexAccounts, fetchCursorAccounts } from "./codexbar.js";
import chalk from "chalk";
import {
  type GridRow,
  type ProviderGroups,
  buildGrid,
  claudeToUnified,
  formatInteractiveDashboard,
} from "./display.js";

const INDENT = "   ";

async function fetchAllGroups(): Promise<ProviderGroups> {
  const codex = fetchCodexAccounts();
  const cursor = fetchCursorAccounts();
  const claudeConfigs = listAccountDetails();
  const claudeRaw =
    claudeConfigs.length > 0
      ? await fetchAllUsage(
          claudeConfigs.map((a) => a.name),
          { quiet: true },
        )
      : [];
  const claude = claudeRaw.map(claudeToUnified);
  return {
    ...(claude.length > 0 && { claude }),
    ...(codex.length > 0 && { codex }),
    ...(cursor.length > 0 && { cursor }),
  };
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

    if (key.name === "r" || key.name === "return") {
      const row = rows[selectedIndex];
      if (row?.claude?.error != null) {
        isProcessing = true;
        await doRefresh(row);
        isProcessing = false;
      }
    }
  };

  process.stdin.on("keypress", onKeypress);

  async function doRefresh(row: GridRow): Promise<void> {
    process.stdin.setRawMode(false);
    statusMessage = `Opening browser for ${row.label} — log in and close the tab...`;
    redraw();

    const ok = await addAccount(row.label, { quiet: true });

    if (ok) {
      statusMessage = "Reloading...";
      redraw();
      groups = await fetchAllGroups();
      rows = buildGrid(groups);
      selectedIndex = Math.min(selectedIndex, rows.length - 1);
      statusMessage = null;
    } else {
      statusMessage = `✗ Re-auth failed for ${row.label}  ·  r to retry`;
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
