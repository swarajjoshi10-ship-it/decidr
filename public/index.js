// JavaScript Client Controller for Decidr Governance Dashboard

// 1. Tab Switching Logic
function switchTab(tabId) {
  document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(panel => panel.classList.remove('active'));

  document.getElementById(`tab-${tabId}`).classList.add('active');
  document.getElementById(`panel-${tabId}`).classList.add('active');

  if (tabId === 'dashboard') {
    loadDashboardData();
  }
}

// 2. Fetch and Render Statistics, Active Decisions, and History
async function loadDashboardData() {
  try {
    // A. Fetch Stats (telemetry data)
    const statsRes = await fetch('/api/stats');
    const stats = await statsRes.json();
    
    document.getElementById('metric-scans').innerText = stats.scansCount || 0;
    document.getElementById('metric-violations').innerText = stats.violationsCount || 0;
    
    // Animate token savings counter for maximum visual premium feel
    animateValue('metric-tokens', 0, stats.tokensSaved || 0, 800);

    // Render the Bypass Efficiency summary string
    const pct = stats.savingsPercentage !== undefined ? stats.savingsPercentage : 100;
    const summary = `${stats.localMatches || 0} checks resolved locally for free · ${stats.escalatedToAI || 0} escalated to AI · ${pct}% resolved without a single API call.`;
    document.getElementById('telemetry-bypass-summary').innerText = summary;

    // B. Fetch Active Decisions count
    const adrsRes = await fetch('/api/decisions');
    const decisions = await adrsRes.json();
    document.getElementById('metric-decisions').innerText = decisions.length || 0;

    // C. Fetch History Event stream
    const historyRes = await fetch('/api/history');
    const history = await historyRes.json();
    
    const tbody = document.getElementById('logs-tbody');
    tbody.innerHTML = '';

    if (history.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No logs logged yet. Run a CLI check!</td></tr>`;
      return;
    }

    for (const event of history) {
      const row = document.createElement('tr');
      
      const timeCell = document.createElement('td');
      timeCell.innerText = new Date(event.timestamp).toLocaleString();
      
      const typeCell = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = `badge ${getBadgeClass(event.event_type)}`;
      badge.innerText = event.event_type.replace('_', ' ');
      typeCell.appendChild(badge);
      
      const entityCell = document.createElement('td');
      entityCell.style.fontFamily = 'monospace';
      entityCell.innerText = event.entity_id;
      
      const actorCell = document.createElement('td');
      actorCell.innerText = event.actor;
      
      const detailsCell = document.createElement('td');
      detailsCell.innerText = formatDetails(event);

      row.appendChild(timeCell);
      row.appendChild(typeCell);
      row.appendChild(entityCell);
      row.appendChild(actorCell);
      row.appendChild(detailsCell);
      tbody.appendChild(row);
    }
  } catch (err) {
    console.error('Failed to load dashboard:', err);
  }
}

// 3. Rule Submission Handler
async function submitADR(event) {
  event.preventDefault();
  
  const id = document.getElementById('adr-id').value.trim();
  const title = document.getElementById('adr-title').value.trim();
  const statement = document.getElementById('adr-statement').value.trim();
  const rationale = document.getElementById('adr-rationale').value.trim();
  const prohibited_for = document.getElementById('adr-prohibited').value.trim();
  const allowed_for = document.getElementById('adr-allowed').value.trim();
  const approved_by = document.getElementById('adr-approved').value.trim();

  try {
    const res = await fetch('/api/decisions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        title,
        statement,
        rationale,
        prohibited_for,
        allowed_for,
        approved_by
      })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(`Error saving ADR: ${data.error}`);
      return;
    }

    // Reset Form and Switch view
    document.getElementById('adr-form').reset();
    switchTab('dashboard');
  } catch (err) {
    alert(`Failed to connect to API server: ${err.message}`);
  }
}

// Helper: Badge Style mapping
function getBadgeClass(type) {
  switch (type) {
    case 'DECISION_CREATED': return 'badge-created';
    case 'SCAN_COMPLETED': return 'badge-scan';
    case 'APPEAL_SUBMITTED': return 'badge-appeal';
    case 'EXCEPTION_APPROVED': return 'badge-approved';
    default: return 'badge-scan';
  }
}

// Helper: Format JSON details nicely in table
function formatDetails(event) {
  const d = event.details || {};
  switch (event.event_type) {
    case 'DECISION_CREATED':
      return `Created ADR "${d.title || ''}": "${d.statement || ''}"`;
    case 'SCAN_COMPLETED':
      return `Scanned project changes. Checked ${d.filesChecked} file(s). ${d.violationsCount} violation(s), ${d.exemptedCount} exemption(s) processed.`;
    case 'APPEAL_SUBMITTED':
      return `Escalated ambiguous code to AI Appeals. Reason: ${d.reason || ''}`;
    case 'EXCEPTION_APPROVED':
      return `Override approved: "${d.reason || ''}" covering paths "${d.scope_paths ? d.scope_paths.join(', ') : ''}"`;
    default:
      return JSON.stringify(d);
  }
}

// Helper: Animated counter utility
function animateValue(id, start, end, duration) {
  const obj = document.getElementById(id);
  if (!obj) return;
  
  if (start === end) {
    obj.innerText = Number(end).toLocaleString();
    return;
  }
  
  const range = end - start;
  let current = start;
  const increment = end > start ? Math.ceil(range / (duration / 16)) : -Math.ceil(Math.abs(range) / (duration / 16));
  
  const timer = setInterval(() => {
    current += increment;
    if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
      clearInterval(timer);
      obj.innerText = Number(end).toLocaleString();
    } else {
      obj.innerText = Number(current).toLocaleString();
    }
  }, 16);
}

// Dynamic UI Render based on Authorization Role
function updateUIForRole(role, username) {
  const tabForm = document.getElementById('tab-form');
  const connector = document.getElementById('tab-nav-connector');
  const dashboardTitle = document.getElementById('dashboard-title');
  const mascotRole = document.getElementById('mascot-role');
  const mascotName = document.getElementById('mascot-name');
  const loginBtn = document.getElementById('admin-login-btn');

  if (role === 'admin') {
    // Show rule creator tab
    tabForm.style.display = 'flex';
    connector.style.display = 'block';
    // Update labels and sidebar
    dashboardTitle.innerText = 'Architectural Telemetry';
    mascotRole.innerText = 'Chief Architect';
    mascotName.innerText = username;
    loginBtn.innerText = `Logout (${username})`;
  } else if (role === 'employee') {
    // Hide rule creator tab
    tabForm.style.display = 'none';
    connector.style.display = 'none';
    // Switch views to Audit Logs if they were on rule form
    switchTab('dashboard');
    // Update labels and sidebar
    dashboardTitle.innerText = 'Developer Compliance Monitor';
    mascotRole.innerText = 'Developer Coordinator';
    mascotName.innerText = username;
    loginBtn.innerText = `Logout (${username})`;
  } else {
    // Default Guest state (acts as generic Employee/Developer view)
    tabForm.style.display = 'none';
    connector.style.display = 'none';
    switchTab('dashboard');
    dashboardTitle.innerText = 'Developer Compliance Monitor';
    mascotRole.innerText = 'Compliance Advisor';
    mascotName.innerText = 'Cô Dấu';
    loginBtn.innerText = 'Admin Login';
  }
}

// Authorization Modal Controllers
function showLoginModal() {
  // If already logged in, click acts as a logout trigger
  if (localStorage.getItem('role')) {
    localStorage.removeItem('role');
    localStorage.removeItem('adminName');
    updateUIForRole(null, null);
    return;
  }
  document.getElementById('login-modal').classList.add('active');
}

function hideLoginModal() {
  document.getElementById('login-modal').classList.remove('active');
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
}

function closeLoginModal(event) {
  if (event.target === document.getElementById('login-modal')) {
    hideLoginModal();
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const role = document.getElementById('login-role').value;
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, username, password })
    });

    const data = await res.json();
    if (!res.ok) {
      alert(`Authentication failed: ${data.error || 'Invalid credentials'}`);
      return;
    }

    // Save session details
    localStorage.setItem('role', role);
    localStorage.setItem('adminName', username);
    
    updateUIForRole(role, username);
    hideLoginModal();
  } catch (err) {
    alert(`Connection error: ${err.message}`);
  }
}

// Bootstrapping
window.addEventListener('DOMContentLoaded', () => {
  loadDashboardData();
  
  // Restore login session state
  const savedRole = localStorage.getItem('role');
  const savedUser = localStorage.getItem('adminName');
  updateUIForRole(savedRole, savedUser);
});
