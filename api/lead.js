function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitize(input, maxLength) {
  return String(input || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxLength);
}

function scoreLead(lead) {
  let score = 0;

  if (lead.budget === '>50k') {
    score += 60;
  } else if (lead.budget === '20k-50k') {
    score += 45;
  } else if (lead.budget === '5k-20k') {
    score += 25;
  } else {
    score += 10;
  }

  if (lead.priority.length >= 80) {
    score += 20;
  } else if (lead.priority.length >= 40) {
    score += 10;
  }

  if (isValidEmail(lead.email)) {
    score += 10;
  }

  const leadTier = score >= 70 ? 'A' : score >= 45 ? 'B' : 'C';
  return { score, leadTier };
}

async function sendLeadEmail({ lead, scoring, source, ip, userAgent }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL || 'Webeska Leads <noreply@webeska.agency>';
  const to = process.env.LEAD_TO_EMAIL || 'hi@webeska.agency';

  if (!apiKey) {
    return { ok: false, reason: 'missing_resend_api_key' };
  }

  const subject = `Nouveau lead ${scoring.leadTier} - ${lead.company}`;
  const text = [
    'Nouveau lead recu depuis webeska.agency',
    '',
    `Source: ${source}`,
    `Nom: ${lead.fullName}`,
    `Email: ${lead.email}`,
    `Entreprise: ${lead.company}`,
    `Budget: ${lead.budget}`,
    `Lead score: ${scoring.score}`,
    `Lead tier: ${scoring.leadTier}`,
    `IP: ${ip}`,
    `User-Agent: ${userAgent}`,
    '',
    'Priorite 90 jours:',
    lead.priority,
  ].join('\n');

  const html = `
    <h2>Nouveau lead webeska.agency</h2>
    <p><strong>Source:</strong> ${source}</p>
    <p><strong>Nom:</strong> ${lead.fullName}</p>
    <p><strong>Email:</strong> ${lead.email}</p>
    <p><strong>Entreprise:</strong> ${lead.company}</p>
    <p><strong>Budget:</strong> ${lead.budget}</p>
    <p><strong>Lead score:</strong> ${scoring.score}</p>
    <p><strong>Lead tier:</strong> ${scoring.leadTier}</p>
    <p><strong>IP:</strong> ${ip}</p>
    <p><strong>User-Agent:</strong> ${userAgent}</p>
    <p><strong>Priorite 90 jours:</strong><br/>${lead.priority}</p>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: lead.email,
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    return { ok: false, reason: `resend_http_${response.status}`, details };
  }

  return { ok: true };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const source = sanitize(req.body && req.body.source, 80) || 'webeska_landing_v1';
  const leadInput = (req.body && req.body.lead) || {};

  const lead = {
    fullName: sanitize(leadInput.fullName, 120),
    email: sanitize(leadInput.email, 120).toLowerCase(),
    company: sanitize(leadInput.company, 120),
    budget: sanitize(leadInput.budget, 32),
    priority: sanitize(leadInput.priority, 1000),
  };

  if (!lead.fullName || !lead.email || !lead.company || !lead.budget || !lead.priority) {
    return res.status(400).json({ ok: false, error: 'missing_required_fields' });
  }

  if (!isValidEmail(lead.email)) {
    return res.status(400).json({ ok: false, error: 'invalid_email' });
  }

  const allowedBudgets = new Set(['<5k', '5k-20k', '20k-50k', '>50k']);
  if (!allowedBudgets.has(lead.budget)) {
    return res.status(400).json({ ok: false, error: 'invalid_budget' });
  }

  const scoring = scoreLead(lead);
  const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || 'unknown';
  const userAgent = sanitize(req.headers['user-agent'], 500) || 'unknown';

  const emailResult = await sendLeadEmail({ lead, scoring, source, ip, userAgent });

  if (!emailResult.ok) {
    return res.status(503).json({ ok: false, error: 'email_delivery_failed', reason: emailResult.reason });
  }

  return res.status(200).json({ ok: true, leadTier: scoring.leadTier, leadScore: scoring.score });
};
