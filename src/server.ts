import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { DecidrRepo } from './repo/index.js';
import { ADRSchema } from './repo/schemas.js';

const app = express();
const port = 3000;
const repo = new DecidrRepo();

app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'public')));

// 1. Get Active Decisions
app.get('/api/decisions', async (req, res) => {
  try {
    const decisions = await repo.getActiveDecisions();
    res.json(decisions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Create a New ADR (Visual Rule Maker)
app.post('/api/decisions', async (req, res) => {
  try {
    const { id, title, statement, rationale, prohibited_for, allowed_for, approved_by } = req.body;

    if (!id || !title || !statement || !approved_by) {
      return res.status(400).json({ error: 'Missing required fields: id, title, statement, approved_by' });
    }

    // Build schema-compliant ADR object
    const newADR = {
      id,
      status: 'active',
      decision: {
        statement,
        rationale: Array.isArray(rationale) ? rationale : [rationale || 'Standard policy guidelines'],
      },
      constraints: [
        {
          subject: title.toLowerCase().replace(/\s+/g, '_'),
          prohibited_for: Array.isArray(prohibited_for)
            ? prohibited_for
            : String(prohibited_for || '').split(',').map(s => s.trim()).filter(Boolean),
          allowed_for: Array.isArray(allowed_for)
            ? allowed_for
            : String(allowed_for || '').split(',').map(s => s.trim()).filter(Boolean),
        }
      ],
      approved_by,
    };

    // Validate using Zod schema
    ADRSchema.parse(newADR);

    // Save as YAML configuration file
    const decisionsDir = path.join(process.cwd(), '.decidr', 'decisions');
    await fs.mkdir(decisionsDir, { recursive: true });
    
    const YAML = await import('yaml');
    await fs.writeFile(
      path.join(decisionsDir, `${id}.yaml`),
      YAML.stringify(newADR),
      'utf-8'
    );

    // Log ADR creation event
    await repo.logEvent({
      event_type: 'DECISION_CREATED',
      entity_id: id,
      actor: approved_by,
      details: { title, statement },
    });

    res.json({ success: true, adr: newADR });
  } catch (err: any) {
    console.error('✖ Failed to save ADR rule:', err);
    res.status(400).json({ error: err.message || 'Invalid ADR structure' });
  }
});

// 3. Get History Logs
app.get('/api/history', async (req, res) => {
  try {
    const history = await repo.getHistory();
    res.json(history);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Calculate Live Telemetry Metrics & Token Savings
app.get('/api/stats', async (req, res) => {
  try {
    const history = await repo.getHistory();
    
    let scansCount = 0;
    let violationsCount = 0;
    let exemptedCount = 0;
    let localMatches = 0;
    let escalatedToAI = 0;

    for (const event of history) {
      if (event.event_type === 'SCAN_COMPLETED') {
        scansCount++;
        const details = event.details || {};
        violationsCount += Number(details.violationsCount || 0);
        exemptedCount += Number(details.exemptedCount || 0);
        localMatches += Number(details.passedCount || 0) + Number(details.violationsCount || 0) + Number(details.exemptedCount || 0);
      }
      if (event.event_type === 'APPEAL_SUBMITTED') {
        escalatedToAI++;
      }
    }

    const totalChecks = localMatches + escalatedToAI;
    const savingsPercentage = totalChecks > 0 ? Number(((localMatches / totalChecks) * 100).toFixed(1)) : 100;
    const tokensSaved = localMatches * 1000;

    res.json({
      scansCount,
      violationsCount,
      exemptedCount,
      tokensSaved,
      localMatches,
      escalatedToAI,
      savingsPercentage
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`\n🚀 Decidr Governance Dashboard running at http://localhost:${port}\n`);
});
