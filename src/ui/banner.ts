import boxen from 'boxen';
import gradient from 'gradient-string';

export function renderInterceptBanner(agentId: string, action: string): void {
  const message = `❌ ACTION BLOCKED BY AI GOVERNANCE LAYER (${agentId})\nAttempted: ${action}\nVerdict: BLOCKED. Escalating to human approval loop...`;
  console.log(
    boxen(gradient.pastel(message), {
      padding: 1,
      borderColor: 'red',
      borderStyle: 'double',
    })
  );
}