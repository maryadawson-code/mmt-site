// ===== PROPOSALPULSE — AI DOCUMENT SCORER =====

const API_URL = '/.netlify/functions/score-deck';
const BG_URL = '/.netlify/functions/score-deck-background';
const STATUS_URL = '/.netlify/functions/score-status';
const GOLD_TEAM_URL = '/.netlify/functions/gold-team-review-background';
const CHECKOUT_URL = '/.netlify/functions/create-checkout';
const FEEDBACK_URL = '/.netlify/functions/submit-feedback';
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB
const POLL_INTERVAL_MS = 3000;  // Poll every 3 seconds
const POLL_TIMEOUT_MS = 300000; // 5 minute timeout

const ALLOWED_EXTENSIONS = ['pdf', 'pptx', 'docx'];
const MIME_MAP = {
  'pdf': 'application/pdf',
  'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

let selectedFile = null;
let fileBase64 = null;
let sowFile = null;
let sowBase64 = null;
let pipelineTimers = [];
let isSubmitting = false;
let userCancelled = false;
let pollTimer = null;
let pollTimeoutTimer = null;
let goldTeamAbort = null;
let currentScoringId = null;
let currentAccessToken = null;

// ===== SVG ICON HELPERS =====

function getCheckIcon() {
  return '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle cx="9" cy="9" r="7" fill="rgba(0,210,159,0.15)"/><path d="M6 9.5l2 2 4-4" stroke="var(--grade-a)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function getSpinnerIcon() {
  return '<div class="step-spinner"></div>';
}

function getPendingIcon() {
  return '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle cx="9" cy="9" r="7" stroke="rgba(255,255,255,0.15)" stroke-width="2"/></svg>';
}

// ===== SCREEN MANAGEMENT =====

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(id);
  screen.classList.add('active');
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: prefersReduced ? 'instant' : 'smooth' });
  screen.setAttribute('tabindex', '-1');
  screen.focus({ preventScroll: true });
}

// ===== AUTO-DETECT DOCUMENT TYPE =====

function autoDetectDocType(filename) {
  const name = filename.toLowerCase();
  if (/rfp|rfi|response/.test(name)) return 'rfp_response';
  if (/pricing|cost/.test(name)) return 'pricing_volume';
  if (/capabilit|cap.?statement/.test(name)) return 'capabilities_statement';
  if (/exec.*summ|executive/.test(name)) return 'executive_summary';
  if (/white.?paper|whitepaper/.test(name)) return 'white_paper';
  if (/pitch|deck/.test(name)) return 'pitch_deck';
  return 'pitch_deck';
}

// ===== FILE HANDLING =====

const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');
const emailInput = document.getElementById('email-input');
const submitBtn = document.getElementById('btn-submit');

uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});

// Drag and drop
uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  if (e.dataTransfer.files.length > 0) handleFileSelect(e.dataTransfer.files[0]);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) {
    if (typeof plausible !== 'undefined') plausible('ProposalPulse: File Selected');
    handleFileSelect(fileInput.files[0]);
  }
});

emailInput.addEventListener('input', updateSubmitButton);

// Pill selector click handlers
document.querySelectorAll('.pill-selector .pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.pill-selector .pill').forEach(p => p.classList.remove('pill-active'));
    pill.classList.add('pill-active');
    document.getElementById('doc-type-select').value = pill.dataset.value;
  });
});

function handleFileSelect(file) {
  hideError();

  // Validate extension
  const ext = file.name.split('.').pop().toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    showError('Unsupported file type. Please upload a PDF, PowerPoint (.pptx), or Word (.docx) file.');
    return;
  }

  // Validate size
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    showError(`File is too large (${sizeMB}MB). Maximum size is 4MB. Try compressing images or exporting a lower-resolution PDF.`);
    return;
  }

  selectedFile = file;

  // Show preview
  document.getElementById('file-name').textContent = file.name;
  document.getElementById('file-size').textContent = formatFileSize(file.size);
  document.getElementById('file-preview').classList.add('visible');
  uploadZone.style.display = 'none';

  // Auto-detect document type from filename
  const detectedType = autoDetectDocType(file.name);
  document.getElementById('doc-type-select').value = detectedType;
  document.querySelectorAll('.pill-selector .pill').forEach(p => {
    p.classList.toggle('pill-active', p.dataset.value === detectedType);
  });

  // Reveal upload details with transition
  revealUploadDetails();

  // Read as base64
  readFileAsBase64(file).then(b64 => {
    fileBase64 = b64;
    updateSubmitButton();
  }).catch(() => {
    showError('Could not read the file. Please try again.');
    removeFile();
  });
}

function removeFile() {
  selectedFile = null;
  fileBase64 = null;
  fileInput.value = '';
  document.getElementById('file-preview').classList.remove('visible');
  uploadZone.style.display = '';
  hideUploadDetails();
  updateSubmitButton();
}

function revealUploadDetails() {
  const el = document.getElementById('upload-details');
  // Remove any stale transitionend listeners
  el.removeEventListener('transitionend', el._onRevealEnd);
  el.style.height = el.scrollHeight + 'px';
  el._onRevealEnd = (e) => {
    if (e.propertyName !== 'height') return;
    el.style.height = 'auto';
    el.removeEventListener('transitionend', el._onRevealEnd);
  };
  el.addEventListener('transitionend', el._onRevealEnd);
  setTimeout(() => emailInput.focus(), 350);
}

function hideUploadDetails() {
  const el = document.getElementById('upload-details');
  // Remove any stale transitionend listeners
  el.removeEventListener('transitionend', el._onRevealEnd);
  el.style.height = el.scrollHeight + 'px';
  requestAnimationFrame(() => { el.style.height = '0'; });
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function updateSubmitButton() {
  const emailValid = emailInput.value.trim() && emailInput.checkValidity();
  const isReady = emailValid && fileBase64;
  submitBtn.disabled = !isReady;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ===== SOW FILE HANDLING =====

const sowUploadZone = document.getElementById('sow-upload-zone');
const sowFileInput = document.getElementById('sow-file-input');
const sowChevron = document.getElementById('sow-chevron');
const sowDetails = document.getElementById('sow-details');

sowDetails.addEventListener('toggle', () => {
  sowChevron.style.transform = sowDetails.open ? 'rotate(180deg)' : '';
});

sowUploadZone.addEventListener('click', () => sowFileInput.click());
sowUploadZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sowFileInput.click(); }
});
sowUploadZone.addEventListener('dragover', (e) => { e.preventDefault(); sowUploadZone.classList.add('drag-over'); });
sowUploadZone.addEventListener('dragleave', () => sowUploadZone.classList.remove('drag-over'));
sowUploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  sowUploadZone.classList.remove('drag-over');
  if (e.dataTransfer.files.length > 0) handleSowFileSelect(e.dataTransfer.files[0]);
});
sowFileInput.addEventListener('change', () => {
  if (sowFileInput.files.length > 0) handleSowFileSelect(sowFileInput.files[0]);
});

function handleSowFileSelect(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    showError('SOW file must be PDF, PowerPoint (.pptx), or Word (.docx).');
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    showError('SOW file is too large. Maximum 4MB.');
    return;
  }
  sowFile = file;
  document.getElementById('sow-file-name').textContent = file.name;
  document.getElementById('sow-file-size').textContent = formatFileSize(file.size);
  document.getElementById('sow-file-preview').classList.add('visible');
  sowUploadZone.style.display = 'none';
  document.getElementById('sow-badge').style.display = '';

  readFileAsBase64(file).then(b64 => { sowBase64 = b64; }).catch(() => {
    showError('Could not read the SOW file. Please try again.');
    removeSowFile();
  });
}

function removeSowFile() {
  sowFile = null;
  sowBase64 = null;
  sowFileInput.value = '';
  document.getElementById('sow-file-preview').classList.remove('visible');
  sowUploadZone.style.display = '';
  document.getElementById('sow-badge').style.display = 'none';
}

// ===== ERROR HANDLING =====

function showError(msg) {
  const banner = document.getElementById('upload-error');
  document.getElementById('upload-error-text').textContent = msg;
  banner.classList.add('visible');
}

function hideError() {
  document.getElementById('upload-error').classList.remove('visible');
}

// ===== PIPELINE (Processing Steps) =====

function startPipeline() {
  const steps = document.querySelectorAll('.pipeline-step');
  // Reset all to pending
  steps.forEach(step => {
    step.classList.remove('step-active', 'step-done');
    step.querySelector('.step-icon').innerHTML = getPendingIcon();
  });
  // Step 1 active immediately
  activateStep(0);

  // Schedule remaining steps
  const delays = [15000, 30000, 50000, 70000];
  pipelineTimers = [];
  delays.forEach((delay, i) => {
    const timer = setTimeout(() => {
      completeStep(i);
      activateStep(i + 1);
    }, delay);
    pipelineTimers.push(timer);
  });
}

function completePipeline() {
  pipelineTimers.forEach(t => clearTimeout(t));
  pipelineTimers = [];
  document.querySelectorAll('.pipeline-step').forEach(step => {
    step.classList.remove('step-active');
    step.classList.add('step-done');
    step.querySelector('.step-icon').innerHTML = getCheckIcon();
  });
}

function completePipelineAnimated() {
  pipelineTimers.forEach(t => clearTimeout(t));
  pipelineTimers = [];
  const steps = document.querySelectorAll('.pipeline-step');
  const remaining = [];
  steps.forEach((step, i) => {
    if (!step.classList.contains('step-done')) remaining.push(i);
  });
  return new Promise(resolve => {
    if (remaining.length === 0) { setTimeout(resolve, 400); return; }
    remaining.forEach((stepIdx, i) => {
      setTimeout(() => {
        completeStep(stepIdx);
        if (i === remaining.length - 1) setTimeout(resolve, 400);
      }, i * 150);
    });
  });
}

function activateStep(index) {
  const steps = document.querySelectorAll('.pipeline-step');
  if (index < steps.length) {
    steps[index].classList.add('step-active');
    steps[index].querySelector('.step-icon').innerHTML = getSpinnerIcon();
  }
}

function completeStep(index) {
  const steps = document.querySelectorAll('.pipeline-step');
  if (index < steps.length) {
    steps[index].classList.remove('step-active');
    steps[index].classList.add('step-done');
    steps[index].querySelector('.step-icon').innerHTML = getCheckIcon();
  }
}

// ===== SUBMIT DECK =====

async function submitDeck() {
  const email = emailInput.value.trim();
  if (!email || !fileBase64 || !selectedFile || isSubmitting) return;

  if (typeof plausible !== 'undefined') plausible('ProposalPulse: Submit');
  isSubmitting = true;
  userCancelled = false;
  submitBtn.disabled = true;
  hideError();
  showScreen('screen-processing');
  document.getElementById('processing-filename').innerHTML = 'Scoring <strong style="color:var(--text-secondary);">' + esc(selectedFile.name) + '</strong>';
  startPipeline();

  // Determine MIME type from extension
  const ext = selectedFile.name.split('.').pop().toLowerCase();
  const mimeType = MIME_MAP[ext] || selectedFile.type;
  const documentType = document.getElementById('doc-type-select').value;

  try {
    // Step 1: POST to gateway — validate, create pending row, decrement usage
    const gatewayResponse = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        file_base64: fileBase64,
        file_type: mimeType,
        file_name: selectedFile.name,
        document_type: documentType,
      }),
    });

    if (!gatewayResponse.ok) {
      completePipeline();
      isSubmitting = false;
      const errData = await gatewayResponse.json().catch(() => null);

      if (gatewayResponse.status === 403 && errData && errData.error === 'limit_reached') {
        showScreen('screen-limit');
        return;
      }

      const errMsg = (errData && errData.error) || 'Something went wrong. Please try again.';
      showScreen('screen-upload');
      showError(errMsg);
      return;
    }

    let gatewayData;
    try { gatewayData = await gatewayResponse.json(); } catch (e) {
      completePipeline();
      isSubmitting = false;
      showScreen('screen-upload');
      showError('Received an invalid response. Please try again.');
      return;
    }

    const scoringId = gatewayData.scoring_id;
    const accessToken = gatewayData.access_token;
    if (!scoringId) {
      completePipeline();
      isSubmitting = false;
      showScreen('screen-upload');
      showError('Could not start scoring. Please try again.');
      return;
    }

    // Step 2: Fire background function (returns 202 immediately)
    // Only sends scoring_id — all data is stored in the DB by the gateway
    fetch(BG_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scoring_id: scoringId }),
    }).then(function(resp) {
      if (!resp.ok && resp.status !== 202) {
        console.error('Background trigger returned status:', resp.status);
      }
    }).catch(function() {
      console.error('Background function trigger failed');
    });

    // Step 3: Poll for results (pass access token for auth)
    startPolling(scoringId, gatewayData, accessToken);

  } catch (err) {
    completePipeline();
    showScreen('screen-upload');
    showError('Network error. Check your connection and try again.');
    isSubmitting = false;
  }
}

// ===== POLLING =====

function startPolling(scoringId, gatewayData, accessToken) {
  stopPolling();

  // Store access token for feedback submission later
  currentAccessToken = accessToken || null;

  // Set overall timeout
  pollTimeoutTimer = setTimeout(() => {
    stopPolling();
    completePipeline();
    showScreen('screen-upload');
    showError('Scoring is taking longer than expected. Check your email for results, or try again with a smaller file.');
    isSubmitting = false;
  }, POLL_TIMEOUT_MS);

  pollTimer = setInterval(async () => {
    try {
      const response = await fetch(STATUS_URL + '?scoring_id=' + encodeURIComponent(scoringId) + '&token=' + encodeURIComponent(accessToken || ''));
      if (!response.ok) return; // Retry on next interval

      const data = await response.json();

      if (data.status === 'processing') return; // Keep polling

      // Done — stop polling
      stopPolling();

      if (data.status === 'error') {
        completePipeline();
        showScreen('screen-upload');
        showError(data.error || 'Scoring failed. Please try again.');
        isSubmitting = false;
        return;
      }

      if (data.status === 'complete') {
        data.scoring_id = scoringId;
        await completePipelineAnimated();
        renderResults(data);
        isSubmitting = false;
        return;
      }
    } catch (err) {
      // Network error on poll — just retry next interval
    }
  }, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (pollTimeoutTimer) { clearTimeout(pollTimeoutTimer); pollTimeoutTimer = null; }
}

function cancelSubmission() {
  userCancelled = true;
  stopPolling();
  completePipeline();
  isSubmitting = false;
  showScreen('screen-upload');
}

// ===== RENDER RESULTS =====

function renderResults(data) {
  currentScoringId = data.scoring_id || null;
  const sc = data.scorecard;
  const scores = sc.scores || [];

  // Compute overall grade from average points
  const avgPoints = scores.length > 0
    ? scores.reduce((sum, s) => sum + (s.points || 0), 0) / scores.length
    : 0;

  let overallGrade;
  if (avgPoints >= 3.75) overallGrade = 'A';
  else if (avgPoints >= 3.25) overallGrade = 'B+';
  else if (avgPoints >= 2.75) overallGrade = 'B';
  else if (avgPoints >= 2.25) overallGrade = 'B-';
  else if (avgPoints >= 1.75) overallGrade = 'C+';
  else if (avgPoints >= 1.25) overallGrade = 'C';
  else if (avgPoints >= 0.75) overallGrade = 'D';
  else overallGrade = 'F';

  // Verdict class
  let verdictClass = 'verdict-fail';
  if (sc.verdict === 'PASS') verdictClass = 'verdict-pass';
  else if (sc.verdict === 'CONDITIONAL') verdictClass = 'verdict-conditional';

  // Grade color
  let gradeColor;
  if (overallGrade.startsWith('A')) gradeColor = 'var(--grade-a)';
  else if (overallGrade.startsWith('B')) gradeColor = 'var(--grade-b)';
  else if (overallGrade.startsWith('C')) gradeColor = 'var(--grade-c)';
  else if (overallGrade === 'D') gradeColor = 'var(--grade-d)';
  else gradeColor = 'var(--grade-f)';

  // Grade ring SVG
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(avgPoints / 4 * 100, 100);
  const dashTarget = circumference * (1 - pct / 100);

  // Uses remaining badge
  const usesBadge = typeof data.uses_remaining === 'number'
    ? `<div class="uses-badge">${data.uses_remaining} free assessment${data.uses_remaining !== 1 ? 's' : ''} remaining</div>`
    : '';

  // Verdict with grade ring
  document.getElementById('results-verdict').innerHTML = `
    <div class="verdict-status ${verdictClass}">${esc(sc.verdict || 'SCORED')}</div>
    <div class="grade-ring">
      <svg width="80" height="80" viewBox="0 0 80 80">
        <circle class="ring-track" cx="40" cy="40" r="${radius}"/>
        <circle class="ring-fill" cx="40" cy="40" r="${radius}"
          stroke="${gradeColor}"
          stroke-dasharray="${circumference}"
          style="--dash-total: ${circumference}; --dash-target: ${dashTarget};"
        />
      </svg>
      <div class="ring-label" style="color: ${gradeColor}">${esc(overallGrade)}</div>
    </div>
    <div class="verdict-title">${esc(sc.verdict_title || '')}</div>
    <p class="verdict-summary">${esc(sc.verdict_summary || '')}</p>
    ${usesBadge}
  `;

  // Scorecard rows with staggered reveal
  const ringDelay = 800; // ms for ring animation
  const rows = scores.map((s, i) => {
    const cls = getGradeClass(s.grade);
    const assessment = s.assessment ? `<div class="scorecard-assessment">${esc(s.assessment)}</div>` : '';
    const delay = (i * 50) + ringDelay + 600;
    return `
      <div class="scorecard-row reveal" style="animation-delay: ${delay}ms">
        <div class="scorecard-row-top">
          <span class="scorecard-criteria">${esc(s.title)}</span>
          <span class="scorecard-grade ${cls}">${esc(s.grade)}</span>
        </div>
        ${assessment}
      </div>
    `;
  }).join('');

  document.getElementById('results-scorecard').innerHTML = `
    <div class="scorecard-header">Full Scorecard</div>
    ${rows}
  `;

  // Calculate delays for elements after scorecard
  const lastRowDelay = (scores.length * 50) + ringDelay + 600;
  const topFixDelay = lastRowDelay + 100;
  const redFlagsDelay = topFixDelay + 100;

  // Top Fix
  if (sc.top_fix) {
    document.getElementById('results-top-fix').innerHTML = `
      <div class="top-fix reveal" style="animation-delay: ${topFixDelay}ms">
        <h3>Top Fix</h3>
        <p>${esc(sc.top_fix)}</p>
      </div>
    `;
  } else {
    document.getElementById('results-top-fix').innerHTML = '';
  }

  // Red Flags
  if (sc.red_flags && sc.red_flags.length > 0) {
    document.getElementById('results-red-flags').innerHTML = `
      <div class="red-flags reveal" style="animation-delay: ${redFlagsDelay}ms">
        <h3>Red Flags Detected (${sc.red_flags.length})</h3>
        <ul>${sc.red_flags.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
      </div>
    `;
  } else {
    document.getElementById('results-red-flags').innerHTML = '';
  }

  // Upsell CTA (show only when no uses remaining)
  const upsellEl = document.getElementById('results-upsell');
  if (typeof data.uses_remaining === 'number' && data.uses_remaining <= 0) {
    upsellEl.innerHTML = `
      <div class="upsell-box">
        <h3>Score another proposal</h3>
        <p>Each assessment includes the full Gold Team Review: every section rewritten for evaluator impact, a probability-of-win estimate, executive summary, and a prioritized fix list you can act on today.</p>
        <button class="btn btn-primary" id="btn-upsell-checkout">Unlock 1 Assessment &mdash; $19.99 &#8594;</button>
        <p class="stripe-note">Secure checkout via Stripe &middot; No subscription required</p>
      </div>
    `;
  } else {
    upsellEl.innerHTML = '';
  }

  if (typeof plausible !== 'undefined') plausible('ProposalPulse: Score Received');
  showScreen('screen-results');

  // Bind upsell checkout button if rendered
  const upsellBtn = document.getElementById('btn-upsell-checkout');
  if (upsellBtn) upsellBtn.addEventListener('click', startCheckout);

  // Trigger Gold Team Review from frontend
  triggerGoldTeamReview(data);

  // Render feedback widget
  renderFeedbackWidget();
}

// ===== GOLD TEAM REVIEW =====

function triggerGoldTeamReview(data) {
  const statusEl = document.getElementById('gold-team-status');

  // Show loading state
  statusEl.innerHTML = `
    <div class="gold-team-status">
      <div class="gold-team-spinner-small"></div>
      <div class="gold-team-status-text">
        Your Gold Team Review is being prepared and will arrive in your email in 1&ndash;2 minutes.
      </div>
    </div>
  `;

  // Only send scoring_id — Gold Team reads everything from the DB
  goldTeamAbort = new AbortController();
  fetch(GOLD_TEAM_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scoring_id: data.scoring_id }),
    signal: goldTeamAbort.signal,
  })
  .then(response => {
    if (response.status === 202 || response.ok) {
      statusEl.innerHTML = `
        <div class="gold-team-status success">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <div class="gold-team-status-text">
            Gold Team Review sent. Check your inbox in 1&ndash;2 minutes.
          </div>
        </div>
      `;
    } else {
      showGoldTeamFallback(statusEl);
    }
  })
  .catch(() => {
    showGoldTeamFallback(statusEl);
  });
}

function showGoldTeamFallback(statusEl) {
  statusEl.innerHTML = `
    <div class="gold-team-status error">
      <div class="gold-team-status-text">
        Gold Team Review unavailable. Your scorecard above is still valid.
      </div>
    </div>
  `;
}

// ===== STRIPE CHECKOUT =====

let isCheckingOut = false;
async function startCheckout() {
  if (typeof plausible !== 'undefined') plausible('ProposalPulse: Checkout');
  const email = emailInput.value.trim();
  if (!email) {
    showScreen('screen-upload');
    showError('Please enter your email address first.');
    return;
  }
  if (isCheckingOut) return;
  isCheckingOut = true;

  try {
    const response = await fetch(CHECKOUT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => null);
      const msg = (errData && errData.error) || 'Could not start checkout. Please try again.';
      showScreen('screen-upload');
      showError(msg);
      return;
    }

    const data = await response.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      showScreen('screen-upload');
      showError('Could not start checkout. Please try again.');
    }
  } catch (err) {
    showScreen('screen-upload');
    showError('Network error. Check your connection and try again.');
  } finally {
    isCheckingOut = false;
  }
}

// ===== FEEDBACK WIDGET =====

function renderFeedbackWidget() {
  const container = document.getElementById('feedback-container');
  const starSvg = `<svg viewBox="0 0 24 24" fill="currentColor" class="feedback-star" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
  container.innerHTML = `
    <div class="feedback-widget">
      <div class="feedback-label">How useful was this assessment?</div>
      <div class="feedback-stars" id="feedback-stars" role="radiogroup" aria-label="Rating">
        ${[1,2,3,4,5].map(n => `<button type="button" class="feedback-star-btn" data-rating="${n}" aria-label="${n} star${n > 1 ? 's' : ''}" style="background:none;border:none;padding:0;cursor:pointer;">${starSvg}</button>`).join('')}
      </div>
      <button type="button" class="feedback-comment-toggle" id="feedback-comment-toggle">Add a comment</button>
      <div class="feedback-comment-area" id="feedback-comment-area">
        <textarea id="feedback-comment" placeholder="Optional feedback (max 500 characters)" maxlength="500" aria-label="Feedback comment"></textarea>
      </div>
      <button class="btn btn-primary btn-sm feedback-submit" id="feedback-submit-btn" disabled>Submit Feedback</button>
    </div>
  `;

  let selectedRating = 0;
  const starsContainer = document.getElementById('feedback-stars');
  const submitBtn = document.getElementById('feedback-submit-btn');

  function updateStars(rating, isHover) {
    starsContainer.querySelectorAll('.feedback-star').forEach((star, i) => {
      star.classList.remove('star-hover', 'star-active');
      if (i < rating) {
        star.classList.add(isHover ? 'star-hover' : 'star-active');
      } else if (!isHover && i < selectedRating) {
        star.classList.add('star-active');
      }
    });
  }

  starsContainer.querySelectorAll('.feedback-star-btn').forEach(btn => {
    btn.addEventListener('mouseenter', function() {
      updateStars(parseInt(this.dataset.rating), true);
    });
    btn.addEventListener('click', function() {
      selectedRating = parseInt(this.dataset.rating);
      submitBtn.disabled = false;
      updateStars(selectedRating, false);
    });
  });

  starsContainer.addEventListener('mouseleave', function() {
    updateStars(selectedRating, false);
  });

  document.getElementById('feedback-comment-toggle').addEventListener('click', function() {
    const area = document.getElementById('feedback-comment-area');
    area.classList.toggle('visible');
    if (area.classList.contains('visible')) {
      area.querySelector('textarea').focus();
      this.textContent = 'Hide comment';
    } else {
      this.textContent = 'Add a comment';
    }
  });

  // Bind submit feedback button
  document.getElementById('feedback-submit-btn').addEventListener('click', submitFeedback);

  // Store selectedRating getter for submitFeedback
  container._getSelectedRating = () => selectedRating;
}

async function submitFeedback() {
  const container = document.getElementById('feedback-container');
  const rating = container._getSelectedRating ? container._getSelectedRating() : 0;
  if (!rating || !currentScoringId) return;

  const commentEl = document.getElementById('feedback-comment');
  const comment = commentEl ? commentEl.value.trim() : null;

  const submitBtn = document.getElementById('feedback-submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';

  try {
    const response = await fetch(FEEDBACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scoring_id: currentScoringId,
        access_token: currentAccessToken,
        rating: rating,
        comment: comment || null,
      }),
    });

    if (response.ok) {
      container.innerHTML = `
        <div class="feedback-widget">
          <div class="feedback-thanks">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            Thank you for your feedback!
          </div>
        </div>
      `;
    } else {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Feedback';
    }
  } catch (err) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Feedback';
  }
}

function getGradeClass(grade) {
  if (!grade) return 'sg-f';
  if (grade.startsWith('A')) return 'sg-a';
  if (grade.startsWith('B')) return 'sg-b';
  if (grade.startsWith('C')) return 'sg-c';
  if (grade === 'D') return 'sg-d';
  return 'sg-f';
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ===== RESET =====

function resetTool() {
  // Stop any in-flight polling and requests
  stopPolling();
  if (goldTeamAbort) { goldTeamAbort.abort(); goldTeamAbort = null; }
  pipelineTimers.forEach(t => clearTimeout(t));
  pipelineTimers = [];
  isSubmitting = false;

  selectedFile = null;
  fileBase64 = null;
  fileInput.value = '';
  emailInput.value = '';
  document.getElementById('doc-type-select').value = 'pitch_deck';
  // Reset pill selector
  document.querySelectorAll('.pill-selector .pill').forEach(p => {
    p.classList.toggle('pill-active', p.dataset.value === 'pitch_deck');
  });
  document.getElementById('file-preview').classList.remove('visible');
  // Reset upload details without animation (instant)
  const detailsEl = document.getElementById('upload-details');
  detailsEl.removeEventListener('transitionend', detailsEl._onRevealEnd);
  detailsEl.style.height = '0';
  document.getElementById('gold-team-status').innerHTML = '';
  document.getElementById('feedback-container').innerHTML = '';
  currentScoringId = null;
  currentAccessToken = null;
  document.getElementById('results-upsell').innerHTML = '';
  document.getElementById('payment-success-banner').innerHTML = '';
  // Remove any stale payment success banner from upload screen
  const staleSuccess = document.querySelector('#screen-upload .payment-success');
  if (staleSuccess) staleSuccess.remove();
  uploadZone.style.display = '';
  submitBtn.disabled = true;
  removeSowFile();
  if (sowDetails.open) sowDetails.open = false;
  hideError();
  showScreen('screen-upload');
}

// ===== PAYMENT SUCCESS DETECTION =====

(function checkPaymentSuccess() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('session_id')) {
    // Show success banner and go to upload screen
    showScreen('screen-upload');
    const banner = document.getElementById('upload-error');
    // Repurpose the area above upload for a success message
    const successDiv = document.createElement('div');
    successDiv.className = 'payment-success';
    successDiv.setAttribute('role', 'status');
    successDiv.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
      <span>Payment confirmed. You have 1 additional assessment ready to use.</span>
    `;
    banner.parentNode.insertBefore(successDiv, banner);
    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);
  }
  if (params.get('cancelled')) {
    showScreen('screen-limit');
    window.history.replaceState({}, '', window.location.pathname);
  }
})();

// ===== EVENT LISTENERS (CSP-safe, no inline onclick) =====

document.getElementById('btn-remove-file').addEventListener('click', removeFile);
document.getElementById('btn-remove-sow').addEventListener('click', removeSowFile);
document.getElementById('btn-submit').addEventListener('click', submitDeck);
document.getElementById('btn-cancel').addEventListener('click', cancelSubmission);
document.getElementById('btn-print').addEventListener('click', () => window.print());
document.getElementById('btn-reset').addEventListener('click', resetTool);
document.getElementById('btn-checkout').addEventListener('click', startCheckout);
document.getElementById('btn-start-over').addEventListener('click', resetTool);
