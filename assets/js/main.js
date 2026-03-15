const buttons = document.querySelectorAll('.btn');
const leadForm = document.querySelector('#lead-form');
const formMessage = document.querySelector('#form-message');

function trackEvent(name, payload = {}) {
  const eventPayload = {
    event: name,
    page: 'landing',
    timestamp: new Date().toISOString(),
    ...payload,
  };

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(eventPayload);
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
  leadForm.addEventListener('submit', (event) => {
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
      return;
    }

    const payload = {
      fullName: String(formData.get('fullName') || '').trim(),
      email: String(formData.get('email') || '').trim(),
      company: String(formData.get('company') || '').trim(),
      budget: String(formData.get('budget') || '').trim(),
      priority: String(formData.get('priority') || '').trim(),
    };

    trackEvent('lead_form_submitted', {
      budget: payload.budget,
      company: payload.company,
    });

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

    window.location.href = `mailto:contact@webeska.agency?subject=${subject}&body=${body}`;

    if (formMessage) {
      formMessage.textContent = 'Merci. Votre demande est prete a etre envoyee.';
    }
  });
}
