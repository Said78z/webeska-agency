# webeska.agency

Site vitrine et machine de conversion pour une agence Growth IA orientee performance.

## Objectif du projet

Construire une presence web qui:

- positionne webeska.agency comme partenaire Growth IA premium;
- convertit du trafic froid en leads qualifies;
- supporte un process commercial scalable (audit -> proposition -> closing).

## Positionnement

- Promesse: scaler la croissance via marketing de performance + automatisation IA.
- Cible: fondateurs, heads of growth, COO/CMO de PME et scale-ups.
- Angle: execution rapide, ROI mesurable, systemes repetables.

## MVP (phase 1)

Le MVP doit inclure:

- une landing page claire et differenciante;
- une proposition de valeur forte au-dessus de la ligne de flottaison;
- des sections services, methode, preuves, CTA;
- une base technique propre pour iterer vite.

## Stack initiale

- Front-end: HTML, CSS, JavaScript (vanilla)
- Hebergement: Vercel (production)
- Backend: Vercel Functions (Node.js)
- Email transactionnel: Resend API
- Analytics: dataLayer + GA4 / Google Ads

## Configuration runtime front

Le fichier assets/js/config.js pilote le tracking et l'integration Google Ads.

Variables disponibles:

- leadApiUrl: endpoint backend de soumission lead (par defaut /api/lead)
- requestTimeoutMs: timeout reseau de la soumission
- source: identifiant de la source funnel
- googleAds.enabled: active/desactive gtag
- googleAds.id: identifiant Google Ads (format AW-XXXXXXXXXX)
- googleAds.leadConversionLabel: label de conversion lead

## Variables d'environnement (Vercel)

Definir ces secrets dans Project Settings -> Environment Variables:

- RESEND_API_KEY
- LEAD_FROM_EMAIL
- LEAD_TO_EMAIL (defaut: hi@webeska.agency)

Un exemple est fourni dans .env.example.

## Lancer en local (sans Vercel CLI)

Serveur local full code (front + API):

1. Lancer: node dev-server.js
2. Ouvrir: http://localhost:3000
3. Tester l'API: POST http://localhost:3000/api/lead

Pour activer l'envoi email en local, definir ces variables avant le lancement:

1. export RESEND_API_KEY=...
2. export LEAD_FROM_EMAIL="Webeska Leads <noreply@webeska.agency>"
3. export LEAD_TO_EMAIL="hi@webeska.agency"

Exemple:

RESEND_API_KEY=re_xxx LEAD_TO_EMAIL=hi@webeska.agency node dev-server.js

Smoke test local en une commande:

./scripts/smoke-test.sh

## Parametres Vercel recommandes

Si Vercel detecte a tort Next.js:

1. Framework Preset: Other
2. Build Command: vide
3. Output Directory: vide
4. Install Command: vide
5. Supprimer tout Production Override contenant .next

## API backend lead

Endpoint: POST /api/lead

Le backend:

- valide les champs obligatoires;
- sanitise les donnees;
- calcule un lead score + lead tier;
- envoie un email vers hi@webeska.agency via Resend.

Exemple de payload envoye:

{
	"source": "webeska_landing_v1",
	"submittedAt": "2026-03-15T10:00:00.000Z",
	"lead": {
		"fullName": "Sarah Martin",
		"email": "sarah@acme.com",
		"company": "Acme",
		"budget": "20k-50k",
		"priority": "Augmenter le volume SQL sans degrader le close rate"
	},
	"scoring": {
		"score": 65,
		"leadTier": "B"
	}
}

## Evenements funnel instrumentes

- cta_click
- lead_validation_failed
- lead_form_submitted
- lead_api_success
- lead_api_failed
- lead_spam_blocked

Ces events sont pushes dans dataLayer pour exploitation GA4/GTM.

## SEO technique en place

- Meta title + description optimises
- Open Graph + Twitter Cards
- Canonical + robots directives
- JSON-LD ProfessionalService
- robots.txt
- sitemap.xml

## Roadmap de dev (petit a petit)

### Sprint 0 - Foundation (en cours)

1. Structurer le README et cadrer le projet.
2. Creer une landing page de base avec direction artistique forte.
3. Preparer une architecture simple et maintainable.

### Sprint 1 - Conversion

1. Ajouter un formulaire de qualification.
2. Integrer tracking des events (clic CTA, soumission, scroll).
3. Ajouter preuves sociales et etudes de cas.

### Sprint 2 - Automation IA

1. Connecter l'API lead au CRM interne.
2. Mettre en place un scoring automatique avance.
3. Lancer des sequences de follow-up basees sur lead tier.

### Sprint 3 - Optimisation

1. A/B tests sur hero, CTA et offres.
2. Optimisation du temps de chargement.
3. Iterations basees sur data (CPL, CVR, taux de qualif).

## Arborescence cible

.
|- README.md
|- index.html
|- services.html
|- methode.html
|- cas-clients.html
|- contact.html
|- pricing.html
|- ressources.html
|- icp-saas.html
|- icp-ecommerce.html
|- icp-cabinet.html
|- assets/
	|- css/
	|  |- styles.css
	|- js/
		|- config.js
		|- ads.js
		|- main.js

## Pages du site agence

- index.html: hub principal et proposition de valeur
- services.html: catalogue d'offres Growth IA
- methode.html: framework d'execution en 4 phases
- cas-clients.html: preuves de performance et resultats
- contact.html: page conversion principale avec formulaire
- pricing.html: offres, comparatif et CTA de cadrage
- ressources.html: hub de contenus tactical SEO/CRO
- icp-saas.html: landing verticale SaaS B2B
- icp-ecommerce.html: landing verticale e-commerce
- icp-cabinet.html: landing verticale cabinet de conseil

## Definition of Done (MVP)

- Hero + proposition de valeur + CTA principal visibles en moins de 3 secondes.
- Design responsive mobile/desktop.
- Structure prete a recevoir formulaire, tracking et CRM.

## Prochaines actions immediates

1. Brancher un mini CMS headless pour les cas clients et ressources.
2. Ajouter dashboard CPL -> SQL -> Closing en pilotage hebdo.
3. Integrer un module de prise de rendez-vous (Calendly ou equivalent full code).