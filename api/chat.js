'use strict';

const https = require('https');
const path = require('path');

// ─── Knowledge Base (RAG) ────────────────────────────────────────────────────
let KB = null;

function loadKB() {
  if (KB) return KB;
  try {
    KB = require(path.join(__dirname, '..', 'knowledge-base.json'));
  } catch {
    KB = { chunks: [] };
  }
  return KB;
}

// ─── RAG: BM25-lite retrieval ────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'en', 'au',
  'aux', 'à', 'ce', 'se', 'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils',
  'elles', 'que', 'qui', 'est', 'pas', 'par', 'sur', 'pour', 'avec', 'dans',
  'ou', 'si', 'mais', 'donc', 'or', 'ni', 'car', 'its', 'the', 'is', 'are',
  'what', 'how', 'can', 'your', 'you', 'me', 'my', 'our', 'this', 'that',
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/\W+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

function scoreChunk(chunk, queryTokens) {
  const titleTokens = tokenize(chunk.title);
  const contentTokens = tokenize(chunk.content);
  const tagTokens = (chunk.tags || []).flatMap((t) => tokenize(t));

  const docFreq = {};
  for (const t of contentTokens) docFreq[t] = (docFreq[t] || 0) + 1;

  let score = 0;
  for (const qt of queryTokens) {
    // Content TF
    if (docFreq[qt]) score += Math.log(1 + docFreq[qt]) * 1.0;
    // Title match bonus
    if (titleTokens.includes(qt)) score += 4.0;
    // Tag match bonus
    if (tagTokens.includes(qt)) score += 2.5;
    // Partial stem match (first 4 chars)
    const stem = qt.slice(0, 4);
    if (stem.length >= 3) {
      if (titleTokens.some((t) => t.startsWith(stem))) score += 1.5;
      if (tagTokens.some((t) => t.startsWith(stem))) score += 1.0;
    }
  }
  return score;
}

function retrieveContext(query, topK = 3) {
  const kb = loadKB();
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return '';

  const scored = kb.chunks
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, queryTokens) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  if (!scored.length) return '';

  return scored
    .map((s) => `### ${s.chunk.title}\n${s.chunk.content}`)
    .join('\n\n');
}

// ─── System prompt (persona Webeska) ────────────────────────────────────────

function buildSystemPrompt(context) {
  const base = `Tu es **Weba**, l'assistant IA de Webeska Agency — une agence growth orientée ROI spécialisée en performance marketing, automation IA et pilotage data pour les PME et scale-ups.

**Persona et ton :**
- Professionnel, direct, chaleureux. Tutoiement si l'utilisateur le propose.
- Langue : français par défaut, anglais si l'utilisateur écrit en anglais.
- Réponses courtes et percutantes (2-4 phrases maximum). Développe uniquement si explicitement demandé.
- Utilise des listes ou emojis sobres pour la clarté quand c'est utile.
- Ne jamais inventer de chiffres, tarifs ou informations non présents dans le contexte.
- Si une information dépasse ton contexte, propose de contacter l'équipe : hi@webeska.agency

**Tes missions :**
1. Répondre précisément aux questions sur les services, tarifs, méthode et résultats de Webeska.
2. Conseiller sur les stratégies growth marketing, SEO, automation IA en général.
3. Qualifier le besoin du prospect et l'orienter vers le bon service ou tarif.
4. Terminer les échanges pertinents en proposant un **diagnostic gratuit** (lien : /contact.html).

**Règle absolue :** Tu représentes Webeska Agency. N'aide pas à créer du contenu malveillant, du spam ou des pratiques contraires à l'éthique marketing.`;

  if (!context) return base;

  return `${base}

---
**Contexte récupéré (utilise ces informations pour répondre précisément) :**

${context}
---`;
}

// ─── Rate limiting (in-memory, per IP) ───────────────────────────────────────

const RateLimiter = (() => {
  const store = new Map();
  const WINDOW_MS = 60_000;
  const MAX_RPM = 20;

  return {
    check(ip) {
      const now = Date.now();
      const entry = store.get(ip) || { count: 0, reset: now + WINDOW_MS };

      if (now > entry.reset) {
        entry.count = 0;
        entry.reset = now + WINDOW_MS;
      }

      entry.count += 1;
      store.set(ip, entry);

      if (entry.count > MAX_RPM) return false;
      return true;
    },
  };
})();

// ─── Input validation ─────────────────────────────────────────────────────────

function sanitize(str, maxLen = 500) {
  return String(str || '')
    .trim()
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .slice(0, maxLen);
}

function validateHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (m) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string',
    )
    .slice(-8) // keep last 8 messages max
    .map((m) => ({
      role: m.role,
      content: sanitize(m.content, 800),
    }));
}

// ─── Groq API call ────────────────────────────────────────────────────────────

function callGroq(messages, apiKey) {
  const payload = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    messages,
    temperature: 0.65,
    max_tokens: 600,
    stream: false,
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(`groq_api_error: ${parsed.error.message || 'unknown'}`));
            return;
          }
          const content = parsed?.choices?.[0]?.message?.content;
          if (content) {
            resolve(content.trim());
          } else {
            reject(new Error('groq_empty_response'));
          }
        } catch {
          reject(new Error('groq_parse_error'));
        }
      });
    });

    req.on('error', (err) => reject(new Error(`groq_network_error: ${err.message}`)));
    req.setTimeout(15_000, () => {
      req.destroy(new Error('groq_timeout'));
    });

    req.write(payload);
    req.end();
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  // Only POST
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // API key check
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ ok: false, error: 'chatbot_unavailable', reason: 'missing_groq_api_key' });
  }

  // Parse body
  const body = typeof req.body === 'object' ? req.body : {};

  // Rate limiting
  const clientIp =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  if (!RateLimiter.check(clientIp)) {
    return res.status(429).json({ ok: false, error: 'rate_limit_exceeded' });
  }

  // Validate inputs
  const rawMessage = body.message;
  if (!rawMessage || typeof rawMessage !== 'string') {
    return res.status(400).json({ ok: false, error: 'missing_message' });
  }

  const message = sanitize(rawMessage, 500);
  if (message.length < 1) {
    return res.status(400).json({ ok: false, error: 'empty_message' });
  }

  const history = validateHistory(body.history);

  // RAG: retrieve relevant context
  const context = retrieveContext(message);

  // Build messages for Groq
  const systemPrompt = buildSystemPrompt(context);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: message },
  ];

  // Call Groq
  try {
    const reply = await callGroq(messages, apiKey);
    return res.status(200).json({
      ok: true,
      reply,
      contextUsed: context.length > 0,
    });
  } catch (err) {
    const reason = err.message || 'unknown_error';

    if (reason.includes('timeout')) {
      return res.status(504).json({ ok: false, error: 'llm_timeout' });
    }
    if (reason.includes('groq_api_error')) {
      return res.status(502).json({ ok: false, error: 'llm_error', detail: reason });
    }

    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
};
