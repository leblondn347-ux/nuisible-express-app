// Nuisible Express 34 : point d'entrée de l'application
import { html, render, useState, useEffect, Icon, Chargement, toast, aller } from './ui.js';
import { sb, moi, chargerRef, estAdmin, onFile, enAttente, vider, urlFichier } from './db.js';
import { cls } from './util.js';
import { Connexion, NouveauMotDePasse } from './pages/connexion.js';
import { Accueil } from './pages/accueil.js';
import { Planning } from './pages/planning.js';
import { Clients, FicheClient } from './pages/clients.js';
import { NouvelleIntervention } from './pages/nouvelle.js';
import { Intervention } from './pages/intervention.js';
import { Produits } from './pages/produits.js';
import { Rapports, Documents } from './pages/documents.js';
import { Contrats, FicheContrat } from './pages/contrats.js';
import { Reglages, Registre } from './pages/reglages.js';
import { ImportAgenda } from './pages/import-agenda.js';

const ROUTES = {
  accueil: Accueil, planning: Planning, clients: Clients, client: FicheClient, nouvelle: NouvelleIntervention,
  intervention: Intervention, produits: Produits, rapports: Rapports, documents: Documents,
  contrats: Contrats, contrat: FicheContrat, reglages: Reglages, registre: Registre, 'import-agenda': ImportAgenda,
};
const PARENT = { client: 'clients', intervention: 'planning', nouvelle: 'planning', contrat: 'contrats', registre: 'reglages', 'import-agenda': 'reglages' };
const NAV = [['accueil', 'home', 'Accueil'], ['planning', 'cal', 'Planning'], ['clients', 'users', 'Clients'], ['contrats', 'contract', 'Contrats'],
  ['produits', 'flask', 'Produits AMM'], ['rapports', 'doc', 'Rapports'], ['documents', 'clip', 'Documents'], ['reglages', 'gear', 'Réglages']];

export function lireRoute() {
  const [chemin, qs] = (location.hash.replace(/^#\/?/, '') || 'accueil').split('?');
  const [nom, id] = chemin.split('/');
  return { nom: ROUTES[nom] ? nom : 'accueil', id: id ? decodeURIComponent(id) : null, q: Object.fromEntries(new URLSearchParams(qs || '')) };
}

function Logo({ petit }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { if (moi.entreprise?.logo_chemin) urlFichier('entreprise', moi.entreprise.logo_chemin).then(setUrl); }, [moi.entreprise?.logo_chemin]);
  if (url) return html`<a class="brand" href="#/accueil"><img src=${url} alt="Nuisible Express 34" /></a>`;
  return html`<a class="brand avec-logo" href="#/accueil"><img class="rond" src="icons/logo-160.png" alt="" /><div><b>NUISIBLE</b><span>EXPRESS 34</span>${!petit && html`<small>Gestion des interventions</small>`}</div></a>`;
}

function Coquille({ route, children }) {
  const cur = PARENT[route.nom] || route.nom;
  const [plus, setPlus] = useState(false);
  const [file, setFile] = useState(enAttente());
  const [enLigne, setEnLigne] = useState(navigator.onLine);
  useEffect(() => onFile(setFile), []);
  useEffect(() => { const a = () => setEnLigne(navigator.onLine); addEventListener('online', a); addEventListener('offline', a); return () => { removeEventListener('online', a); removeEventListener('offline', a); }; }, []);
  useEffect(() => setPlus(false), [route.nom, route.id]);
  const p = moi.profil || {};
  const nom = [p.prenom, p.nom].filter(Boolean).join(' ') || p.email || '';
  const top = NAV.some(n => n[0] === route.nom);
  return html`<div class="shell">
    <aside class="side">
      <${Logo} />
      <nav class="nav">${NAV.map(([v, i, l]) => html`<a href=${'#/' + v} class=${cur === v ? 'on' : ''}><${Icon} n=${i} />${l}</a>`)}</nav>
      <a class="btn pri newbtn" href="#/nouvelle"><${Icon} n="plus" sw="2.2" />Nouvelle intervention</a>
      <a class="side-user" href="#/reglages"><div class="avatar">${(nom[0] || '?').toUpperCase()}</div><div><b>${nom}</b><br /><span style="color:var(--side-muted)">${estAdmin() ? 'Administrateur' : 'Technicien'}</span></div></a>
    </aside>
    <div class="main">
      <header class="topm">
        ${top ? html`<${Logo} petit />` : html`<button class="back" onClick=${() => history.length > 1 ? history.back() : aller(cur)} aria-label="Retour"><${Icon} n="back" sw="2.2" /></button>`}
        <a class="avatar" href="#/reglages" style="text-decoration:none">${(nom[0] || '?').toUpperCase()}</a>
      </header>
      ${moi.entreprise?.demo_de && html`<div class="offline demo">Espace de démonstration : les clients sont fictifs, tu peux tout essayer.</div>`}
      ${(!enLigne || file > 0) && html`<div class="offline">${!enLigne ? 'Hors connexion : tes saisies sont gardées sur l’appareil. ' : ''}${file > 0 ? `${file} modification(s) en attente d’envoi.` : ''}
        ${enLigne && file > 0 && html` <button class="link" onClick=${vider}>Envoyer maintenant</button>`}</div>`}
      <div class="view">${children}</div>
      <nav class="bnav">
        <a href="#/accueil" class=${cur === 'accueil' ? 'on' : ''}><${Icon} n="home" />Accueil</a>
        <a href="#/planning" class=${cur === 'planning' ? 'on' : ''}><${Icon} n="cal" />Planning</a>
        <a href="#/nouvelle" class="plus" aria-label="Nouvelle intervention"><span><${Icon} n="plus" sw="2.4" /></span></a>
        <a href="#/clients" class=${cur === 'clients' ? 'on' : ''}><${Icon} n="users" />Clients</a>
        <button class=${['contrats', 'produits', 'rapports', 'documents', 'reglages'].includes(cur) ? 'on' : ''} onClick=${() => setPlus(!plus)}><${Icon} n="more" />Plus</button>
      </nav>
      ${plus && html`<div class="morepop" onClick=${() => setPlus(false)}>
        ${NAV.slice(3).map(([v, i, l]) => html`<a href=${'#/' + v}><${Icon} n=${i} />${l}</a>`)}</div>`}
    </div></div>`;
}

function SansAcces() {
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState(null);
  const [att, setAtt] = useState(false);
  const go = async e => {
    e.preventDefault(); setMsg(null); setAtt(true);
    const { data, error } = await sb.rpc('utiliser_code', { p_code: code.trim() });
    setAtt(false);
    if (error) return setMsg(error.message);
    if (data !== 'ok') return setMsg(data);
    location.hash = '#/accueil'; location.reload();
  };
  return html`<div class="login"><form class="box card stack" onSubmit=${go}>
    <h2 class="ptitle" style="font-size:1.6rem">Compte <em>sans accès</em></h2>
    <p style="margin:0">Ton compte <b>${moi.session?.user?.email}</b> n'a pas d'accès pour le moment (pas encore de code, ou accès bloqué par l'administrateur).</p>
    <label><span class="fl">Code d'accès</span><input class="inp" required autocapitalize="characters" autocomplete="off" placeholder="ex. AB7K-2QXM" value=${code} onInput=${e => setCode(e.target.value.toUpperCase())} /></label>
    ${msg && html`<div class="err">${msg}</div>`}
    <button class="btn pri block" disabled=${att}>${att ? 'Un instant…' : 'Valider le code'}</button>
    <button type="button" class="link" onClick=${() => sb.auth.signOut()}>Se déconnecter</button></form></div>`;
}

function App() {
  const [etat, setEtat] = useState('chargement');
  const [route, setRoute] = useState(lireRoute());
  useEffect(() => {
    const f = () => { setRoute(lireRoute()); document.querySelector('.main')?.scrollTo(0, 0); window.scrollTo(0, 0); };
    addEventListener('hashchange', f); return () => removeEventListener('hashchange', f);
  }, []);
  useEffect(() => {
    let fait = false;
    const demarrer = async session => {
      moi.session = session;
      if (!session) { moi.profil = null; setEtat('connexion'); return; }
      try {
        await chargerRef();
        if (!moi.profil) {
          const { data } = await sb.from('profils').select('*').eq('id', session.user.id).maybeSingle();
          moi.profil = data;
        }
        setEtat(moi.profil ? 'ok' : 'sansacces');
        vider();
      } catch (e) { console.error(e); setEtat('ok'); toast('Données de départ indisponibles : ' + e.message, true); }
    };
    const { data: { subscription } } = sb.auth.onAuthStateChange((ev, session) => {
      if (ev === 'PASSWORD_RECOVERY') { setEtat('motdepasse'); return; }
      if (ev === 'INITIAL_SESSION' || ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') {
        if (ev === 'SIGNED_IN' && fait && moi.session?.user?.id === session?.user?.id) return;
        fait = true; setTimeout(() => demarrer(session), 0);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  if (etat === 'chargement') return html`<${Chargement} />`;
  if (etat === 'connexion') return html`<${Connexion} />`;
  if (etat === 'motdepasse') return html`<${NouveauMotDePasse} fini=${() => setEtat('ok')} />`;
  if (etat === 'sansacces') return html`<${SansAcces} />`;
  const Page = ROUTES[route.nom];
  return html`<${Coquille} route=${route}><${Page} key=${route.nom + (route.id || '') + JSON.stringify(route.q)} id=${route.id} q=${route.q} /><//>`;
}

render(html`<${App} />`, document.getElementById('root'));

// Appli installable et utilisable hors connexion
if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const n = reg.installing;
      n?.addEventListener('statechange', () => { if (n.state === 'installed' && navigator.serviceWorker.controller) toast('Nouvelle version installée : elle sera active au prochain démarrage.'); });
    });
  }).catch(() => { });
}
