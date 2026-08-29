#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { DecidrRepo } from './repo/index';

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