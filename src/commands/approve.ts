import inquirer from 'inquirer';
import chalk from 'chalk';
import { DecidrRepo } from '../repo/index.js';
import { Exception } from '../repo/schemas.js';

// TODO: replace with real loader once Person 3's staging format is confirmed
async function loadProposedException(excId: string, repo: DecidrRepo): Promise<Exception | null> {
  const history = await repo.getHistory();
  for (const event of history) {
    if (event.event_type === 'APPEAL_SUBMITTED') {
      const pe = event.details?.proposed_exception;
      if (pe && pe.id === excId) {
        const expiresAt = pe.expires || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        return {
          id: excId,
          decision_id: pe.decision_id,
          scope: { paths: pe.scope_paths || ['src/**'] },
          reason: pe.reason || pe.allowed_usage || 'AI proposed exception',
          approved_by: '',
          created_at: new Date().toISOString(),
          expires_at: expiresAt
        };
      }
    }
  }
  return null;
}

export async function approveCommand(excId: string, repo: DecidrRepo) {
  const proposal = await loadProposedException(excId, repo);

  if (!proposal) {
    console.log(chalk.red(`✖ Proposed exception ${excId} not found in staged history.`));
    return;
  }

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

  // Write exception YAML
  await repo.saveException(finalException);

  await repo.logEvent({
    event_type: 'EXCEPTION_APPROVED',
    entity_id: finalException.id,
    actor: approver,
    details: { decision_id: finalException.decision_id },
  });

  console.log(chalk.green(`\n✔ ${excId} approved and logged.`));
}