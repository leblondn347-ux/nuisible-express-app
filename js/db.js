// Accès à la base Supabase + listes de référence + file d'attente hors connexion
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { uuid } from './util.js';

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'ne34-session' },
});

// ---------- Messages d'erreur en français ----------
export function trad(e) {
  let m = (e && (e.message || e.error_description || e.msg)) || String(e || '');
  if (typeof m !== 'string') m = m.message || JSON.stringify(m);
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.';
  if (/Email not confirmed/i.test(m)) return "Ton adresse e-mail n'est pas encore confirmée : clique sur le lien reçu par e-mail.";
  if (/already registered|already exists/i.test(m)) return 'Un compte existe déjà avec cet e-mail : utilise « Se connecter ».';
  if (/Password should be at least/i.test(m)) return 'Le mot de passe doit faire au moins 6 caractères.';
  if (/rate limit|too many/i.test(m)) return 'Trop de tentatives : patiente quelques minutes.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Pas de connexion internet.';
  if (/row-level security|permission denied/i.test(m)) return "Action réservée à l'administrateur.";
  if (/duplicate key.*reference/i.test(m)) return 'Cette référence de dossier existe déjà.';
  if (/duplicate key.*site_id, numero|postes_site_id_numero/i.test(m)) return 'Ce numéro de poste existe déjà sur ce site.';
  if (/client_nom_obligatoire/.test(m)) return 'Indique au moins un nom (ou une raison sociale).';
  if (/JWT expired/i.test(m)) return 'Session expirée : reconnecte-toi.';
  return m;
}
export async function run(p) {
  const { data, error } = await p;
  if (error) throw new Error(trad(error));
  return data;
}
const estReseau = e => /Failed to fetch|NetworkError|Load failed|Pas de connexion/i.test(String(e && e.message || e));

// ---------- Session et profil ----------
export const moi = { session: null, profil: null, entreprise: null };
export const estAdmin = () => moi.profil?.role === 'admin';

// ---------- Listes de référence (gardées sur le téléphone pour le hors connexion) ----------
export const ref = { prestations: [], nuisibles: [], listes: {}, produits: [], prodNuis: [], modeles: {}, profils: [] };
const ecouteurs = new Set();
export const onRef = f => { ecouteurs.add(f); return () => ecouteurs.delete(f); };
const avertir = () => ecouteurs.forEach(f => f());

export const prestation = code => ref.prestations.find(p => p.code === code) || { code, nom: code || '', couleur: '#8A8782' };
export const liste = nom => ref.listes[nom] || [];
export const produit = id => ref.produits.find(p => p.id === id);
export const nuisible = id => ref.nuisibles.find(n => n.id === id);
export const nomTech = id => { const p = ref.profils.find(x => x.id === id); return p ? [p.prenom, p.nom].filter(Boolean).join(' ') || p.email : ''; };

export async function chargerRef() {
  try {
    const [pr, nu, li, po, pn, mo, en, pf] = await Promise.all([
      run(sb.from('prestations').select('*').order('ordre')),
      run(sb.from('nuisibles').select('*').eq('actif', true).order('ordre')),
      run(sb.from('listes_choix').select('*').eq('actif', true).order('ordre')),
      run(sb.from('produits').select('*').is('supprime_le', null).order('nom')),
      run(sb.from('produits_nuisibles').select('*')),
      run(sb.from('modeles_textes').select('*').eq('actif', true)),
      run(sb.from('entreprises').select('*').limit(1)),
      run(sb.from('profils').select('*')),
    ]);
    Object.assign(ref, { prestations: pr, nuisibles: nu, produits: po, prodNuis: pn, profils: pf, listes: {}, modeles: {} });
    li.forEach(l => (ref.listes[l.liste] ||= []).push(l.valeur));
    mo.forEach(m => (ref.modeles[m.code] = m));
    moi.entreprise = en[0] || null;
    moi.profil = pf.find(p => p.id === moi.session?.user?.id) || moi.profil;
    try { localStorage.setItem('ne34-ref', JSON.stringify({ ref, entreprise: moi.entreprise, profil: moi.profil })); } catch (e) { }
  } catch (e) {
    const c = JSON.parse(localStorage.getItem('ne34-ref') || 'null');
    if (!c) throw e;
    Object.assign(ref, c.ref); moi.entreprise = c.entreprise; moi.profil = c.profil;
  }
  avertir();
}

// Lecture avec copie locale : si le réseau manque, on montre la dernière version connue
export async function lire(cle, fn) {
  try {
    const d = await fn();
    try { localStorage.setItem('ne34-c-' + cle, JSON.stringify(d)); } catch (e) { nettoyerCache(); }
    return d;
  } catch (e) {
    if (!estReseau(e)) throw e;
    const c = localStorage.getItem('ne34-c-' + cle);
    if (c) return JSON.parse(c);
    throw e;
  }
}
function nettoyerCache() {
  Object.keys(localStorage).filter(k => k.startsWith('ne34-c-')).slice(0, 40).forEach(k => localStorage.removeItem(k));
}

// ---------- File d'attente hors connexion ----------
// Les modifications faites sans réseau sont gardées puis envoyées au retour du réseau.
const FILE = 'ne34-file';
const fileLire = () => JSON.parse(localStorage.getItem(FILE) || '[]');
const fileEcrire = f => { localStorage.setItem(FILE, JSON.stringify(f)); avertirFile(); };
const ecouteursFile = new Set();
export const onFile = f => { ecouteursFile.add(f); return () => ecouteursFile.delete(f); };
const avertirFile = () => ecouteursFile.forEach(f => f(fileLire().length));
export const enAttente = () => fileLire().length;

// Fichiers en attente : rangés dans IndexedDB
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('ne34', 1); r.onupgradeneeded = () => r.result.createObjectStore('fichiers'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const idbPut = async (k, v) => { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction('fichiers', 'readwrite'); t.objectStore('fichiers').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); };
const idbGet = async k => { const d = await idb(); return new Promise((res, rej) => { const r = d.transaction('fichiers').objectStore('fichiers').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); };
const idbDel = async k => { const d = await idb(); return new Promise(res => { const t = d.transaction('fichiers', 'readwrite'); t.objectStore('fichiers').delete(k); t.oncomplete = res; }); };

async function executer(op) {
  if (op.type === 'insert') return run(sb.from(op.table).insert(op.row));
  if (op.type === 'upsert') return run(sb.from(op.table).upsert(op.row, { onConflict: op.onConflict || 'id' }));
  if (op.type === 'update') return run(sb.from(op.table).update(op.row).eq('id', op.id));
  if (op.type === 'delete') return run(sb.from(op.table).delete().match(op.match));
  if (op.type === 'upload') {
    const blob = await idbGet(op.cle);
    if (blob) await run(sb.storage.from(op.bucket).upload(op.path, blob, { upsert: true, contentType: op.contentType }));
    await idbDel(op.cle);
  }
  if (op.type === 'rpc') return run(sb.rpc(op.fn, op.args));
}
async function ecrire(op) {
  if (fileLire().length) { fileEcrire([...fileLire(), op]); vider(); return null; }
  try { return await executer(op); }
  catch (e) { if (!estReseau(e)) throw e; fileEcrire([...fileLire(), op]); return null; }
}
let enCours = false;
export async function vider() {
  if (enCours || !navigator.onLine) return;
  enCours = true;
  try {
    let f = fileLire();
    while (f.length) {
      try { await executer(f[0]); }
      catch (e) { if (estReseau(e)) break; console.warn('Modification refusée', f[0], e); }
      f = fileLire().slice(1); fileEcrire(f);
    }
  } finally { enCours = false; }
}
window.addEventListener('online', vider);
setInterval(vider, 30000);

export const ajouter = (table, row) => { row.id ||= uuid(); return ecrire({ type: 'insert', table, row }).then(() => row); };
export const enregistrer = (table, row, onConflict) => { row.id ||= uuid(); return ecrire({ type: 'upsert', table, row, onConflict }).then(() => row); };
export const modifier = (table, id, row) => ecrire({ type: 'update', table, id, row });
export const supprimer = (table, match) => ecrire({ type: 'delete', table, match });
// Suppression « douce » : la ligne reste en base, marquée supprimée
export const corbeille = (table, id) => modifier(table, id, { supprime_le: new Date().toISOString() });

// ---------- Fichiers ----------
export const cheminEntreprise = (...parts) => [moi.profil?.entreprise_id || moi.entreprise?.id, ...parts].join('/');
export async function envoyerFichier(bucket, path, blob, contentType) {
  contentType ||= blob.type || 'application/octet-stream';
  try {
    await run(sb.storage.from(bucket).upload(path, blob, { upsert: true, contentType }));
  } catch (e) {
    if (!estReseau(e)) throw e;
    const cle = uuid(); await idbPut(cle, blob);
    fileEcrire([...fileLire(), { type: 'upload', bucket, path, cle, contentType }]);
  }
  apercus.set(bucket + '/' + path, { url: URL.createObjectURL(blob), t: Date.now() + 3e6 });
  return path;
}
const apercus = new Map();
export async function urlFichier(bucket, path) {
  if (!path) return null;
  const k = bucket + '/' + path, c = apercus.get(k);
  if (c && c.t > Date.now()) return c.url;
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 3600);
  if (error) return null;
  const url = data.signedUrl.startsWith('http') ? data.signedUrl : SUPABASE_URL + '/storage/v1' + data.signedUrl;
  apercus.set(k, { url, t: Date.now() + 3e6 });
  return url;
}
export async function blobFichier(bucket, path) {
  const { data, error } = await sb.storage.from(bucket).download(path);
  if (error) throw new Error(trad(error));
  return data;
}
