/* ─────────────────────────────────────────────────────────────────────────────
   Webeska Chatbot Widget — Weba
   Self-contained: injects its own DOM, uses /api/chat endpoint
───────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────────────
  const API_URL = '/api/chat';
  const MAX_HISTORY = 16; // messages stored (user + assistant)
  const TIMEOUT_MS = 20_000;

  const SUGGESTIONS = [
    'Quels sont vos services ?',
    'Quels sont vos tarifs ?',
    'Comment fonctionne votre methode ?',
    'Je veux un diagnostic gratuit',
  ];

  const WELCOME_MESSAGE =
    "Bonjour ! Je suis **Weba**, l'assistant IA de Webeska Agency. 👋\n\nJe peux vous aider sur nos services growth, tarifs, ou vous donner des conseils en marketing digital.\n\nPar quoi commençons-nous ?";

  // ── State ─────────────────────────────────────────────────────────────────
  let isOpen = false;
  let isTyping = false;
  let conversationHistory = []; // { role, content }[]
  let hasWelcomed = false;

  // ── Markdown-lite renderer ─────────────────────────────────────────────────
  function renderMarkdown(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\n/g, '<br>');
  }

  // ── DOM creation ─────────────────────────────────────────────────────────

  function createWidget() {
    const wrapper = document.createElement('div');
    wrapper.id = 'weba-widget';
    wrapper.setAttribute('aria-live', 'polite');
    wrapper.innerHTML = `
      <!-- FAB button -->
      <button
        id="weba-fab"
        class="weba-fab"
        aria-label="Ouvrir le chat avec Weba"
        aria-expanded="false"
        aria-controls="weba-panel"
      >
        <span class="weba-fab-icon weba-fab-open" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </span>
        <span class="weba-fab-icon weba-fab-close weba-hidden" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </span>
        <span class="weba-fab-badge" id="weba-badge" aria-hidden="true">1</span>
      </button>

      <!-- Chat panel -->
      <div
        id="weba-panel"
        class="weba-panel weba-hidden"
        role="dialog"
        aria-label="Assistant Weba - Webeska Agency"
        aria-modal="false"
      >
        <!-- Header -->
        <div class="weba-header">
          <div class="weba-header-avatar" aria-hidden="true">W</div>
          <div class="weba-header-info">
            <p class="weba-header-name">Weba</p>
            <p class="weba-header-sub">
              <span class="weba-status-dot" aria-hidden="true"></span>
              Assistant Webeska Agency
            </p>
          </div>
          <button class="weba-close-btn" id="weba-close" aria-label="Fermer le chat">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- Messages -->
        <div class="weba-messages" id="weba-messages" role="log" aria-relevant="additions">
        </div>

        <!-- Suggestions -->
        <div class="weba-suggestions" id="weba-suggestions">
          ${SUGGESTIONS.map((s) => `<button class="weba-suggestion" data-text="${s}">${s}</button>`).join('')}
        </div>

        <!-- Input -->
        <div class="weba-input-row">
          <textarea
            id="weba-input"
            class="weba-input"
            placeholder="Posez votre question..."
            rows="1"
            maxlength="500"
            aria-label="Message pour Weba"
          ></textarea>
          <button
            id="weba-send"
            class="weba-send-btn"
            aria-label="Envoyer le message"
            disabled
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
        <p class="weba-footer-note">Propulsé par Groq · LLaMA 3.3</p>
      </div>
    `;
    return wrapper;
  }

  // ── Message rendering ──────────────────────────────────────────────────────

  function appendMessage(role, text) {
    const messagesEl = document.getElementById('weba-messages');
    if (!messagesEl) return;

    const msg = document.createElement('div');
    msg.className = `weba-message weba-message--${role}`;

    const bubble = document.createElement('div');
    bubble.className = 'weba-bubble';
    bubble.innerHTML = renderMarkdown(text);

    if (role === 'assistant') {
      const avatar = document.createElement('div');
      avatar.className = 'weba-msg-avatar';
      avatar.textContent = 'W';
      avatar.setAttribute('aria-hidden', 'true');
      msg.appendChild(avatar);
    }

    msg.appendChild(bubble);
    messagesEl.appendChild(msg);
    scrollToBottom();

    // Add to history
    conversationHistory.push({ role: role === 'user' ? 'user' : 'assistant', content: text });
    if (conversationHistory.length > MAX_HISTORY) {
      conversationHistory = conversationHistory.slice(conversationHistory.length - MAX_HISTORY);
    }
  }

  function showTyping() {
    const messagesEl = document.getElementById('weba-messages');
    if (!messagesEl || isTyping) return;
    isTyping = true;

    const indicator = document.createElement('div');
    indicator.className = 'weba-message weba-message--assistant';
    indicator.id = 'weba-typing';

    const avatar = document.createElement('div');
    avatar.className = 'weba-msg-avatar';
    avatar.textContent = 'W';
    avatar.setAttribute('aria-hidden', 'true');

    const bubble = document.createElement('div');
    bubble.className = 'weba-bubble weba-typing-bubble';
    bubble.setAttribute('aria-label', 'Weba est en train d\'écrire');
    bubble.innerHTML = `
      <span class="weba-dot"></span>
      <span class="weba-dot"></span>
      <span class="weba-dot"></span>
    `;

    indicator.appendChild(avatar);
    indicator.appendChild(bubble);
    messagesEl.appendChild(indicator);
    scrollToBottom();
  }

  function hideTyping() {
    const indicator = document.getElementById('weba-typing');
    if (indicator) indicator.remove();
    isTyping = false;
  }

  function scrollToBottom() {
    const el = document.getElementById('weba-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }

  function hideSuggestions() {
    const s = document.getElementById('weba-suggestions');
    if (s) s.style.display = 'none';
  }

  // ── API call ──────────────────────────────────────────────────────────────

  async function sendMessage(text) {
    if (!text.trim() || isTyping) return;

    hideSuggestions();
    appendMessage('user', text.trim());
    showTyping();
    setSendEnabled(false);

    // Build history without the last user message (already added to history)
    const history = conversationHistory.slice(0, -1);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), history }),
        signal: controller.signal,
      });

      const data = await response.json();
      hideTyping();

      if (data.ok && data.reply) {
        appendMessage('assistant', data.reply);
      } else if (data.error === 'rate_limit_exceeded') {
        appendMessage('assistant', 'Vous envoyez des messages trop rapidement. Merci de patienter quelques secondes. 🙏');
      } else if (data.error === 'chatbot_unavailable') {
        appendMessage('assistant', 'Le chatbot n\'est pas encore configuré côté serveur. Contactez-nous directement : **hi@webeska.agency**');
      } else {
        appendMessage('assistant', 'Désolé, une erreur est survenue. Réessayez ou contactez-nous : **hi@webeska.agency**');
      }
    } catch (err) {
      hideTyping();
      if (err.name === 'AbortError') {
        appendMessage('assistant', 'La réponse prend trop de temps. Réessayez dans un instant.');
      } else {
        appendMessage('assistant', 'Impossible de contacter le serveur. Vérifiez votre connexion ou écrivez-nous : **hi@webeska.agency**');
      }
    } finally {
      clearTimeout(timeoutId);
      setSendEnabled(true);
    }
  }

  // ── UI handlers ──────────────────────────────────────────────────────────

  function openPanel() {
    isOpen = true;
    const panel = document.getElementById('weba-panel');
    const fab = document.getElementById('weba-fab');
    if (!panel || !fab) return;

    panel.classList.remove('weba-hidden');
    panel.classList.add('weba-panel-open');
    fab.classList.add('weba-fab-active');
    fab.setAttribute('aria-expanded', 'true');
    fab.querySelector('.weba-fab-open').classList.add('weba-hidden');
    fab.querySelector('.weba-fab-close').classList.remove('weba-hidden');

    // Hide badge
    const badge = document.getElementById('weba-badge');
    if (badge) badge.style.display = 'none';

    // Welcome message (once)
    if (!hasWelcomed) {
      hasWelcomed = true;
      setTimeout(() => {
        appendMessage('assistant', WELCOME_MESSAGE);
        // Remove from history (welcome is not a real turn)
        conversationHistory = [];
      }, 300);
    }

    // Focus input
    setTimeout(() => {
      const input = document.getElementById('weba-input');
      if (input) input.focus();
    }, 350);

    // Track event
    if (window.dataLayer) {
      window.dataLayer.push({ event: 'chatbot_open', page: document.body.dataset.page || '' });
    }
  }

  function closePanel() {
    isOpen = false;
    const panel = document.getElementById('weba-panel');
    const fab = document.getElementById('weba-fab');
    if (!panel || !fab) return;

    panel.classList.remove('weba-panel-open');
    panel.classList.add('weba-panel-closing');

    setTimeout(() => {
      panel.classList.add('weba-hidden');
      panel.classList.remove('weba-panel-closing');
    }, 280);

    fab.classList.remove('weba-fab-active');
    fab.setAttribute('aria-expanded', 'false');
    fab.querySelector('.weba-fab-open').classList.remove('weba-hidden');
    fab.querySelector('.weba-fab-close').classList.add('weba-hidden');
  }

  function setSendEnabled(enabled) {
    const btn = document.getElementById('weba-send');
    if (btn) btn.disabled = !enabled;
  }

  function handleInputChange() {
    const input = document.getElementById('weba-input');
    if (!input) return;
    const hasText = input.value.trim().length > 0;
    setSendEnabled(hasText && !isTyping);

    // Auto-resize textarea
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  }

  function handleSend() {
    const input = document.getElementById('weba-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text || isTyping) return;
    input.value = '';
    input.style.height = 'auto';
    setSendEnabled(false);
    sendMessage(text);
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  function init() {
    // Avoid double-init
    if (document.getElementById('weba-widget')) return;

    const widget = createWidget();
    document.body.appendChild(widget);

    // FAB click
    document.getElementById('weba-fab').addEventListener('click', () => {
      isOpen ? closePanel() : openPanel();
    });

    // Close button
    document.getElementById('weba-close').addEventListener('click', closePanel);

    // Send button
    document.getElementById('weba-send').addEventListener('click', handleSend);

    // Input events
    const input = document.getElementById('weba-input');
    input.addEventListener('input', handleInputChange);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

    // Suggestion buttons
    document.querySelectorAll('.weba-suggestion').forEach((btn) => {
      btn.addEventListener('click', () => {
        const text = btn.dataset.text;
        if (text) {
          openPanel();
          sendMessage(text);
        }
      });
    });

    // Keyboard: Escape to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) closePanel();
    });
  }

  // ── Boot ──────────────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
