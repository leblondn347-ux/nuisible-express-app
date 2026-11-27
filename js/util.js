// Petits outils : dates, textes, identifiants
export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));

const pad = n => String(n).padStart(2, '0');
export const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
export const JOURS_LONG = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
export const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export const toDate = v => (v instanceof Date ? v : v ? new Date(v.length === 10 ? v + 'T12:00:00' : v) : null);
export const fmtDate = v => { const d = toDate(v); return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : ''; };
export const fmtTime = v => { const d = toDate(v); return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : ''; };
export const fmtDateTime = v => (v ? `${fmtDate(v)} à ${fmtTime(v)}` : '');
export const fmtDateLong = v => { const d = toDate(v); return d ? `${JOURS_LONG[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}` : ''; };
export const fmtDay = v => { const d = toDate(v); return d ? `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()].slice(0, 4)}.` : ''; };
// AAAA-MM-JJ en heure locale
export const dayKey = v => { const d = toDate(v); return d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : ''; };
export const timeKey = v => { const d = toDate(v); return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : ''; };
export const today = () => dayKey(new Date());
export const addDays = (v, n) => { const d = new Date(toDate(v)); d.setDate(d.getDate() + n); return d; };
export const startOfWeek = v => { const d = new Date(toDate(v)); d.setHours(0, 0, 0, 0); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return d; };
// date « AAAA-MM-JJ » + heure « HH:MM » (heure de France) -> ISO
export const isoFrom = (day, time) => (day ? new Date(`${day}T${time || '08:00'}:00`).toISOString() : null);
export const minutesBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 60000);
export const fmtDuree = min => (min == null ? '' : min >= 60 ? `${Math.floor(min / 60)} h ${pad(min % 60)}` : `${min} min`);

export const norm = s => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const matches = (q, ...vals) => { const n = norm(q).trim(); if (!n) return true; const hay = norm(vals.filter(Boolean).join(' ')); return n.split(/\s+/).every(w => hay.includes(w)); };
export const cls = (...a) => a.filter(Boolean).join(' ');
export const debounce = (fn, ms = 400) => {
  let t = null, a;
  const d = (...x) => { a = x; clearTimeout(t); t = setTimeout(() => { t = null; fn(...a); }, ms); };
  d.flush = () => { if (t) { clearTimeout(t); t = null; fn(...a); } };
  return d;
};
// Envoi différé groupé par clé (saisie au clavier) ; tout part en quittant l'écran
const differes = new Map();
export const differe = (cle, fn, ms = 800) => { clearTimeout(differes.get(cle)?.t); differes.set(cle, { fn, t: setTimeout(() => { differes.delete(cle); fn(); }, ms) }); };
export const toutEnvoyer = () => { for (const [k, e] of differes) { clearTimeout(e.t); differes.delete(k); e.fn(); } };
addEventListener('pagehide', toutEnvoyer);
addEventListener('hashchange', toutEnvoyer);
export const plural = (n, s, p) => `${n} ${n > 1 ? (p || s + 's') : s}`;
export const telHref = t => 'tel:' + (t || '').replace(/[^\d+]/g, '');
export const smsHref = (t, body) => {
  const num = (t || '').replace(/[^\d+]/g, '');
  const sep = /iPhone|iPad/.test(navigator.userAgent) ? '&' : '?';
  return `sms:${num}${body ? sep + 'body=' + encodeURIComponent(body) : ''}`;
};
export const mailHref = (to, subject, body, cc) => {
  const p = [];
  if (cc && cc.length) p.push('cc=' + encodeURIComponent([].concat(cc).join(',')));
  if (subject) p.push('subject=' + encodeURIComponent(subject));
  if (body) p.push('body=' + encodeURIComponent(body));
  return `mailto:${[].concat(to || []).join(',')}${p.length ? '?' + p.join('&') : ''}`;
};
export const mapsHref = (adresse, lat, lng) => (lat && lng
  ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
  : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adresse || '')}`);
export const fileSafe = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'fichier';
export const fmtTaille = o => (o == null ? '' : o > 1048576 ? (o / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(o / 1024)) + ' Ko');
export const extOf = name => ((name || '').split('.').pop() || '').toLowerCase();

// Remplace {client}, {date}... dans un texte type
export const remplir = (txt, vals) => (txt || '').replace(/\{(\w+)\}/g, (m, k) => (vals[k] ?? ''));

export const STATUTS = {
  a_planifier: ['À planifier', 'warn'],
  planifie: ['Planifiée', 'or'],
  fait: ['Faite', 'ok'],
  rapport_envoye: ['Rapport envoyé', 'ok'],
  facture: ['Facturée', ''],
  annule: ['Annulée', 'bad'],
  a_repasser: ['À repasser', 'warn'],
};
export const CONTRAT_STATUTS = { actif: ['Actif', 'ok'], a_renouveler: ['À renouveler', 'warn'], termine: ['Terminé', ''], resilie: ['Résilié', 'bad'] };
export const SOUS_TYPES = { societe: 'Société', syndic: 'Syndic', agence_immobiliere: 'Agence immobilière' };
export const ETATS_POSTE = [['en_place', 'En place'], ['realimente', 'Réalimenté'], ['remplace', 'Remplacé'], ['casse', 'Cassé'], ['absent', 'Absent']];
export const CATEGORIES_POSTE = { rongeurs: 'Rongeurs', insectes: 'Insectes', controle: 'Contrôle' };
export const MOMENTS = { avant: 'Avant', pendant: 'Pendant', apres: 'Après', releve: 'Relevé', avis_passage: 'Avis de passage' };

// Image : réduction avant envoi (photos du téléphone très lourdes)
export async function reduireImage(file, max = 1600, qualite = 0.82) {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const r = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * r); c.height = Math.round(bmp.height * r);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', qualite));
    return blob || file;
  } catch (e) { return file; }
}

export const position = (timeout = 10000) => new Promise(res => {
  if (!navigator.geolocation) return res(null);
  navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy }),
    () => res(null), { enableHighAccuracy: true, timeout, maximumAge: 60000 });
});

// Adresse <-> position : service public gratuit de la Base Adresse Nationale
export async function chercherAdresse(q) {
  if (!q || q.trim().length < 4) return [];
  try {
    const r = await fetch('https://api-adresse.data.gouv.fr/search/?limit=5&q=' + encodeURIComponent(q));
    const j = await r.json();
    return (j.features || []).map(f => ({ label: f.properties.label, adresse: f.properties.name, code_postal: f.properties.postcode, ville: f.properties.city, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] }));
  } catch (e) { return []; }
}
export async function adresseDepuisPosition(lat, lng) {
  try {
    const r = await fetch(`https://api-adresse.data.gouv.fr/reverse/?lat=${lat}&lon=${lng}`);
    const f = (await r.json()).features?.[0];
    return f ? { label: f.properties.label, adresse: f.properties.name, code_postal: f.properties.postcode, ville: f.properties.city, lat, lng } : null;
  } catch (e) { return null; }
}

export function telecharger(blob, nom) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nom;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
export const csv = rows => rows.map(r => r.map(v => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n');
