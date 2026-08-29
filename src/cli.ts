#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { DecidrRepo } from './repo/index';
import * as process from 'process';
import { historyCommand } from './commands/history';
import { approveCommand } from './commands/approve';

const program = new Command();
const repo = new DecidrRepo();

program
  .name('decidr')
  .description('Executable Architectural Memory System')
  .version('1.0.0');

// Core Init
program
  .command('init')
  .description('Initialize the .decidr truth repository in the current project')
  .action(async () => {
    try {
      await repo.init();
      console.log(chalk.green('✔ Initialized .decidr/ repository structure successfully.'));
    } catch (err) {
      console.error(chalk.red('✖ Failed to initialize repository:'), err);
    }
  });

// Person 4: History Timeline
program
  .command('history')
  .argument('<adrId>', 'ADR ID to show history for')
  .description('Show the full timeline of events for an ADR')
  .action(async (adrId: string) => {
    await historyCommand(adrId, repo);
  });

// Person 4: Human Approval Workflow
program
  .command('approve')
  .argument('<excId>', 'Exception ID to approve')
  .description('Review and approve an AI-proposed exception')
  .action(async (excId: string) => {
    try {
      await approveCommand(excId, repo);
    } catch (err) {
      console.error(chalk.red('✖ Approval failed:'), err);
    }
  });

// Feature 1: Interactive ASCII Graph & Drift Detection
program
  .command('visual')
  .description('Render living ASCII architectural map and scan for drift')
  .action(async () => {
    /* Call Graph & Drift Module */
  });

// Feature 3: AI Agent Intercept Gateway
program
  .command('intercept')
  .requiredOption('--agent <id>', 'Agent ID')
  .requiredOption('--action <type>', 'Attempted Action')
  .action(async (opts) => {
    /* Call AI Governance Layer */
  });

program.parse(process.argv);