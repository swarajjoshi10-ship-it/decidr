import inquirer from 'inquirer';
import chalk from 'chalk';
import { DecidrRepo } from '../repo/index';
import { Exception } from '../repo/schemas';

// TODO: replace with real loader once Person 3's staging format is confirmed
async function loadProposedException(excId: string): Promise<Exception> {
  return {
    id: excId,
    decision_id: 'ADR-004',
    scope: { paths: ['src/queue/*'] },
    reason: 'Temporary caching workaround, tracked for removal.',
    approved_by: '',
    created_at: new Date().toISOString(),
    expires_at: '2026-12-01',
  };
}

export async function approveCommand(excId: string, repo: DecidrRepo) {
  const proposal = await loadProposedException(excId);

  console.log(chalk.bold('\nProposed exception:'));
  console.log(`  ID:       ${proposal.id}`);
  console.log(`  Decision: ${proposal.decision_id}`);
  console.log(`  Scope:    ${proposal.scope.paths.join(', ')}`);
  console.log(`  Reason:   ${proposal.reason}`);
  console.log(`  Expires:  ${proposal.expires_at}\n`);

  const { approver, confirmed } = await inquirer.prompt([
    { type: 'input', name: 'approver', message: 'Your name/handle:' },
    { type: 'confirm', name: 'confirmed', message: `Approve ${excId}?` },
  ]);

  if (!confirmed) {
    console.log(chalk.yellow('Approval cancelled.'));
    return;
  }

  const finalException: Exception = {
    ...proposal,
    approved_by: approver,
    created_at: new Date().toISOString(),
  };

  // TODO: swap for repo.saveException(finalException) once Person 1 adds it
  console.log(chalk.dim('(would write EXC yaml here — waiting on repo.saveException)'));

  await repo.logEvent({
    event_type: 'EXCEPTION_APPROVED',
    entity_id: finalException.id,
    actor: approver,
    details: { decision_id: finalException.decision_id },
  });

  console.log(chalk.green(`\n✔ ${excId} approved and logged.`));
}