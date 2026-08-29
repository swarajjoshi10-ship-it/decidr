import { DecidrRepo, appeal } from './repo/index.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

async function run() {
  console.log("=== STARTING INTEGRATION VERIFICATION ===");
  const repo = new DecidrRepo(process.cwd());

  // 1. Init Repository
  console.log("\n1. Initializing repository...");
  await repo.init();
  console.log("✔ Repository initialized.");

  // 2. Create a matchedRule YAML file in .decidr/decisions/ADR-002.yaml
  console.log("\n2. Creating mock ADR decision rule...");
  const adrFilePath = path.join(process.cwd(), '.decidr', 'decisions', 'ADR-002.yaml');
  const mockADR = {
    id: "ADR-002",
    status: "active",
    decision: {
      statement: "All API responses must be in JSON. XML responses are forbidden.",
      rationale: ["Consistency", "Easier client parsing"]
    },
    constraints: [
      {
        subject: "api_response",
        prohibited_for: ["xml"]
      }
    ],
    approved_by: "Lead Architect"
  };
  await fs.writeFile(adrFilePath, YAML.stringify(mockADR), 'utf-8');
  console.log("✔ Created ADR-002.yaml");

  // 3. Query active decisions
  console.log("\n3. Querying active decisions via SDK...");
  const decisions = await repo.getActiveDecisions();
  console.log("Active decisions:", JSON.stringify(decisions, null, 2));

  // 4. Run appeal in offline simulation mode
  console.log("\n4. Running appeal in OFFLINE mode (simulation)...");
  process.env.DECIDR_OFFLINE = 'true';
  const ambiguousCode = `res.send(convertToXML(data))`;
  
  const activeExceptions = await repo.getActiveExceptions();
  const historyEvents = ["ADR-002 created on Jan 10"]; // Mock simple history strings

  const resultOffline = await appeal(ambiguousCode, decisions[0], activeExceptions, historyEvents);
  console.log("OFFLINE Result:\n", JSON.stringify(resultOffline, null, 2));

  // 5. Verify the logs in events.jsonl
  console.log("\n5. Checking history events.jsonl...");
  const eventsLogPath = path.join(process.cwd(), '.decidr', 'history', 'events.jsonl');
  const eventsContent = await fs.readFile(eventsLogPath, 'utf-8');
  console.log("Events inside events.jsonl:\n", eventsContent.trim());

  // 6. Verify cache was written
  console.log("\n6. Checking cache file...");
  const cachePath = path.join(process.cwd(), '.decidr', 'appeals-cache.json');
  const cacheContent = await fs.readFile(cachePath, 'utf-8');
  console.log("Cache file content:\n", cacheContent.trim());

  // 7. Run appeal in online/fallback mode (will hit grace block since GROQ_API_KEY is empty)
  console.log("\n7. Running appeal in ONLINE mode (expecting grace fallback)...");
  process.env.DECIDR_OFFLINE = 'false';
  // Use a slightly different code snippet to cause a cache miss
  const differentCode = `res.set('Content-Type', 'text/xml'); res.send(xmlBody);`;
  const resultOnline = await appeal(differentCode, decisions[0], activeExceptions, historyEvents);
  console.log("ONLINE Result:\n", JSON.stringify(resultOnline, null, 2));

  console.log("\n=== INTEGRATION VERIFICATION COMPLETE ===");
}

run().catch(err => {
  console.error("Verification failed:", err);
});
