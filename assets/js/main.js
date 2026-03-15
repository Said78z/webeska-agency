const buttons = document.querySelectorAll('.btn');
const leadForm = document.querySelector('#lead-form');
const formMessage = document.querySelector('#form-message');

const defaultConfig = {
  leadApiUrl: '/api/lead',
  requestTimeoutMs: 8000,
  source: 'webeska_landing_v1',
  googleAds: {
    enabled: false,
    id: 'AW-XXXXXXXXXX',
    leadConversionLabel: 'XXXXXXXXXXXXXXX',
  },
};

const runtimeConfig = {
  ...defaultConfig,
  ...(window.WEBESKA_CONFIG || {}),
  googleAds: {
    ...defaultConfig.googleAds,
    ...((window.WEBESKA_CONFIG && window.WEBESKA_CONFIG.googleAds) || {}),
  },
};

function trackEvent(name, payload = {}) {
  const eventPayload = {
    event: name,
    page: 'landing',
    source: runtimeConfig.source,
    timestamp: new Date().toISOString(),
    ...payload,
  };

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(eventPayload);
}

function setFormMessage(text, type) {
  if (!formMessage) {
    return;
  }

  formMessage.textContent = text;
  formMessage.classList.remove('success', 'error');

  if (type) {
    formMessage.classList.add(type);
  }
}

function scoreLead(payload) {
  let score = 0;

  if (payload.budget === '>50k') {
    score += 60;
  } else if (payload.budget === '20k-50k') {
    score += 45;
  } else if (payload.budget === '5k-20k') {
    score += 25;
  } else {
    score += 10;
  }

  if (payload.priority.length >= 80) {
    score += 20;
  } else if (payload.priority.length >= 40) {
    score += 10;
  }

  if (payload.email.includes('@')) {
    score += 10;
  }

  const leadTier = score >= 70 ? 'A' : score >= 45 ? 'B' : 'C';

  return { score, leadTier };
}

async function postLeadToApi(payload) {
  if (!runtimeConfig.leadApiUrl) {
    return { sent: false, reason: 'missing_api_url' };
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), runtimeConfig.requestTimeoutMs);

  try {
    const response = await fetch(runtimeConfig.leadApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { sent: false, reason: `http_${response.status}` };
    }

    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      reason: error && error.name === 'AbortError' ? 'timeout' : 'network_error',
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function openFallbackMail(payload) {
  const subject = encodeURIComponent('Demande de diagnostic webeska.agency');
  const body = encodeURIComponent(
    [
      `Nom: ${payload.fullName}`,
      `Email: ${payload.email}`,
      `Entreprise: ${payload.company}`,
      `Budget: ${payload.budget}`,
      '',
      'Priorite 90 jours:',
      payload.priority,
    ].join('\n'),
  );

  window.location.href = `mailto:hi@webeska.agency?subject=${subject}&body=${body}`;
}

function fireGoogleAdsLeadConversion() {
  const ads = runtimeConfig.googleAds || {};
  if (!ads.enabled || !ads.id || !ads.leadConversionLabel || typeof window.gtag !== 'function') {
    return;
  }

  window.gtag('event', 'conversion', {
    send_to: `${ads.id}/${ads.leadConversionLabel}`,
  });
}

buttons.forEach((button) => {
  button.addEventListener('click', () => {
    trackEvent('cta_click', {
      label: button.textContent?.trim() || 'cta',
      href: button.getAttribute('href') || '',
      track: button.dataset.track || '',
    });

    button.style.transform = 'translateY(-1px) scale(0.99)';

    window.setTimeout(() => {
      button.style.transform = '';
    }, 120);
  });
});

if (leadForm) {
  leadForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(leadForm);
    const honeypot = formData.get('website');

    if (honeypot) {
      trackEvent('lead_spam_blocked');
      return;
    }

    if (!leadForm.checkValidity()) {
      leadForm.reportValidity();
      trackEvent('lead_validation_failed');
      setFormMessage('Le formulaire est incomplet. Verifie les champs requis.', 'error');
      return;
    }

    const payload = {
      fullName: String(formData.get('fullName') || '').trim(),
      email: String(formData.get('email') || '').trim(),
      company: String(formData.get('company') || '').trim(),
      budget: String(formData.get('budget') || '').trim(),
      priority: String(formData.get('priority') || '').trim(),
    };

    const scoring = scoreLead(payload);

    trackEvent('lead_form_submitted', {
      budget: payload.budget,
      company: payload.company,
      lead_tier: scoring.leadTier,
      lead_score: scoring.score,
      funnel_stage: 'lead',
    });

    setFormMessage('Envoi en cours...', '');

    const apiPayload = {
      source: runtimeConfig.source,
      submittedAt: new Date().toISOString(),
      lead: payload,
      scoring,
    };

    const apiResult = await postLeadToApi(apiPayload);

    if (apiResult.sent) {
      trackEvent('lead_api_success', {
        lead_tier: scoring.leadTier,
        funnel_stage: 'mql',
      });
      fireGoogleAdsLeadConversion();
      setFormMessage('Merci. Votre demande est envoyee, notre equipe vous contacte rapidement.', 'success');
      leadForm.reset();
      return;
    }

    trackEvent('lead_api_failed', {
      reason: apiResult.reason,
      funnel_stage: 'lead',
    });

    setFormMessage('Service temporairement indisponible: ouverture de votre client email en secours.', 'error');
    openFallbackMail(payload);
  });
}
