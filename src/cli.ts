#!/usr/bin/env node

import { program } from "commander";
import chalk from "chalk";
import {
  listAccounts,
  accountExists,
  saveAccount,
  removeAccount,
} from "./accounts.js";
import { addAccount, fetchAllUsage } from "./api.js";
import { displayUsageTable, displayQuickRecommendation } from "./display.js";

program
  .name("claudeusage")
  .description("Check Claude usage across multiple accounts")
  .version("1.0.0");

// Default command - show usage for all accounts
program
  .option("-q, --quick", "Just show the recommended account")
  .action(async (options) => {
    const accounts = listAccounts();

    if (accounts.length === 0) {
      console.log(chalk.yellow("\nNo accounts configured."));
      console.log("Add one with: " + chalk.cyan("claudeusage add <name>"));
      console.log();
      return;
    }

    console.log(chalk.gray("\nFetching usage data (browser windows will flash briefly)...\n"));

    const usage = await fetchAllUsage(accounts.map((a) => a.name));

    if (options.quick) {
      displayQuickRecommendation(usage);
    } else {
      displayUsageTable(usage);
    }
  });

// Add account
program
  .command("add <name>")
  .description("Add a new Claude account")
  .action(async (name: string) => {
    if (accountExists(name)) {
      console.log(chalk.yellow(`\nAccount "${name}" already exists.`));
      console.log("Use " + chalk.cyan(`claudeusage refresh ${name}`) + " to re-authenticate.");
      return;
    }

    const success = await addAccount(name);
    if (success) {
      saveAccount(name);
      console.log(chalk.green(`\n✓ Account "${name}" added successfully.`));
    } else {
      console.log(chalk.red(`\n✗ Failed to add account "${name}".`));
    }
  });

// Remove account
program
  .command("remove <name>")
  .description("Remove a Claude account")
  .action((name: string) => {
    if (removeAccount(name)) {
      console.log(chalk.green(`\n✓ Account "${name}" removed.`));
    } else {
      console.log(chalk.yellow(`\nAccount "${name}" not found.`));
    }
  });

// Refresh account (re-authenticate)
program
  .command("refresh <name>")
  .description("Re-authenticate an account")
  .action(async (name: string) => {
    if (!accountExists(name)) {
      console.log(chalk.yellow(`\nAccount "${name}" not found.`));
      console.log("Use " + chalk.cyan(`claudeusage add ${name}`) + " to add it.");
      return;
    }

    const success = await addAccount(name);
    if (success) {
      console.log(chalk.green(`\n✓ Account "${name}" refreshed successfully.`));
    } else {
      console.log(chalk.red(`\n✗ Failed to refresh account "${name}".`));
    }
  });

// List accounts
program
  .command("list")
  .description("List configured accounts")
  .action(() => {
    const accounts = listAccounts();

    if (accounts.length === 0) {
      console.log(chalk.yellow("\nNo accounts configured."));
      console.log("Add one with: " + chalk.cyan("claudeusage add <name>"));
      return;
    }

    console.log(chalk.bold("\nConfigured accounts:"));
    for (const account of accounts) {
      console.log(`  • ${account.name}`);
    }
    console.log();
  });

program.parse();
