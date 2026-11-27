// Service worker : l'appli s'ouvre même sans réseau
const VERSION = 'ne34-v1.0.4';
const FICHIERS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/config.js', 'js/db.js', 'js/ui.js', 'js/util.js', 'js/data.js', 'js/pdf.js',
  'js/pages/accueil.js', 'js/pages/planning.js', 'js/pages/clients.js', 'js/pages/nouvelle.js', 'js/pages/intervention.js',
  'js/pages/postes.js', 'js/pages/delai.js', 'js/pages/rapport.js', 'js/pages/signature.js', 'js/pages/produits.js',
  'js/pages/documents.js', 'js/pages/contrats.js', 'js/pages/reglages.js', 'js/pages/connexion.js', 'js/pages/import-agenda.js',
  'js/vendor/preact.js', 'js/vendor/hooks.js', 'js/vendor/htm.js', 'js/vendor/supabase.js', 'js/vendor/jspdf.js', 'js/vendor/jszip.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/logo-160.png', 'icons/favicon-32.png',
];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FICHIERS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== VERSION && x !== 'ne34-polices').map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.hostname.endsWith('fonts.googleapis.com') || u.hostname.endsWith('fonts.gstatic.com')) {
    e.respondWith(caches.open('ne34-polices').then(async c => (await c.match(e.request)) || fetch(e.request).then(r => { c.put(e.request, r.clone()); return r; })));
    return;
  }
  if (u.origin !== location.origin) return;
  // Fichiers de l'appli : réponse immédiate depuis la copie locale, mise à jour en arrière-plan
  e.respondWith(caches.open(VERSION).then(async c => {
    const enCache = await c.match(e.request, { ignoreSearch: true });
    const reseau = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => enCache);
    return enCache || reseau;
  }));
});
