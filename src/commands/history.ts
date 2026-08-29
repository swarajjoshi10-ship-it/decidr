import chalk from 'chalk';
import { DecidrRepo } from '../repo/index.js';

export async function historyCommand(adrId: string, repo: DecidrRepo): Promise<void> {
  try {
    const history = await repo.getHistory();

    console.log(chalk.bold(`\n📜 Decidr Audit History Trail for ${adrId}:\n`));
    
    // Filter history events matching the requested ADR ID
    const filteredEvents = history.filter(
      (event) => event.entity_id === adrId || event.details?.decision_id === adrId
    );

    const displayEvents = filteredEvents.length > 0 ? filteredEvents : history;

    if (displayEvents.length === 0) {
      console.log(chalk.dim('No history events recorded yet.'));
      return;
    }

    displayEvents.forEach((event) => {
      console.log(
        `${chalk.dim(event.timestamp)} | ${chalk.cyan(event.event_type.padEnd(22))} | ${chalk.yellow(event.actor)}`
      );
    });
    console.log();
  } catch (err) {
    console.error(chalk.red('✖ Failed to read audit history:'), err);
  }
}