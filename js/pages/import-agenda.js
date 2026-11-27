// Recréer les interventions à partir de l'agenda Google (liste pré-cochée à vérifier avant d'enregistrer)
import { html, useState, Titre, Chargement, Vide, Choix, toast, erreur, confirmer, aller } from '../ui.js';
import { sb, run, moi, ref, prestation } from '../db.js';
import { fmtDay, fmtTime, dayKey, addDays, norm, cls, plural, MOIS, toDate } from '../util.js';
import { viderPerso } from '../data.js';

// Mots qui trahissent un rendez-vous de travail, par prestation
const MOTS = [
  ['deratisation', /\b(rat|rats|souris|surmulot|mulot|campagnol|loir|lerot|rongeur|derat\w*|raticide|appat\w*|boite[s]? d'appat|postes?)\b/],
  ['desinsectisation', /\b(cafard\w*|blatte\w*|punaise\w*|fourmi\w*|guepe\w*|frelon\w*|puce\w*|moustique\w*|chenille\w*|processionnaire\w*|desinsect\w*|insecte\w*|mite\w*|lepisme\w*|araignee\w*|cloporte\w*|tique\w*|charancon\w*|nid)\b/],
  ['desinfection', /\b(desinfect\w*|virus|bacteri\w*|covid|assainiss\w*|nebulis\w*|deodoris\w*)\b/],
  ['depigeonnage', /\b(pigeon\w*|depigeon\w*|picots?|pics anti|filet\w*|goeland\w*|volatile\w*|fientes?)\b/],
  ['travaux_hauteur', /\b(nacelle\w*|hauteur|elagage|toiture|facade|gouttiere\w*)\b/],
];
const TRAVAIL = /\b(intervention|devis|chantier|client|traitement|passage|controle|pose|bilan|curatif|preventif|contrat|syndic|agence|residence|copro\w*|restaurant|hotel|mairie|sarl|sas|eurl|sci)\b/;
const PRO = /\b(sarl|sas|sasu|eurl|sci|syndic|agence|residence|copro\w*|restaurant|hotel|mairie|ehpad|college|lycee|ecole|boulangerie|camping|immobili\w*|foncia|citya|nexity|square habitat|orpi|century)\b/i;
const TEL = /(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/;
const MAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const chiffres = t => (t || '').replace(/\D/g, '').replace(/^33/, '0').slice(-9);

// Adresse « 12 rue X, 34000 Ville, France » → morceaux
function decouperAdresse(s) {
  const t = (s || '').replace(/,?\s*France\s*$/i, '').trim();
  if (!t) return null;
  const m = t.match(/^(.*?)[,\s]+(\d{5})\s+([^,\n]+)/);
  if (m) return { adresse: m[1].replace(/,\s*$/, '').trim() || t, code_postal: m[2], ville: m[3].trim() };
  return { adresse: t.split('\n')[0], code_postal: '', ville: '' };
}

// Nom du client deviné à partir du titre (on retire les mots de métier)
const VIDES = /^(chez|pour|de|du|des|d|la|le|les|l|et|a|au|aux|en|sur|dans|rdv|rv|m|mr|mme|mlle|monsieur|madame|lit|nid|asiatiques?|europeens?|germaniques?|tigres?|cave|garage|grenier|jardin|maison|appartement|appart|toiture|toit|cuisine|combles?|\d+h?\d*)$/;
const majuscule = s => s ? s[0].toUpperCase() + s.slice(1) : s;
function devinerNom(titre, tel) {
  const t = (titre || '').replace(TEL, ' ').replace(/\s+/g, ' ').trim();
  // Un professionnel : on garde tout à partir de « Résidence », « Boulangerie », « SARL »…
  const pro = norm(t).match(new RegExp('(' + PRO.source.slice(2, -2) + ')'));
  if (pro) return majuscule(t.slice(pro.index).replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim());
  const metier = w => { const n = norm(w); return MOTS.some(([, re]) => re.test(n)) || TRAVAIL.test(n) || VIDES.test(n); };
  const garde = t.split(/[\s,;:/()\-–·|]+/).filter(w => w && !metier(w));
  const noms = garde.filter(w => /^\p{Lu}/u.test(w));
  const nom = (noms.length ? noms : garde).join(' ').trim();
  return nom || (tel ? 'Client ' + tel : '');
}

function analyser(e) {
  const tout = norm([e.titre, e.lieu, e.description].join(' \n '));
  const presta = (MOTS.find(([, re]) => re.test(norm(e.titre))) || MOTS.find(([, re]) => re.test(tout)) || [])[0];
  const tel = ((e.titre + ' ' + e.description).match(TEL) || [])[0] || '';
  const mail = ((e.description || '').match(MAIL) || [])[0] || '';
  let adr = decouperAdresse(e.lieu);
  if (!adr) { const l = (e.description || '').split('\n').find(x => /\b\d{5}\b/.test(x) && /\d+\s*,?\s*\w/.test(x)); adr = l ? decouperAdresse(l) : null; }
  // Nuisibles reconnus dans le texte (catégories principales)
  const nuis = ref.nuisibles.filter(n => !n.parent_id && (!presta || n.prestation_code === presta)).filter(n => {
    const racine = norm(n.nom).split(/[\s(]/)[0].replace(/s$/, '');
    return racine.length > 3 && tout.includes(racine);
  }).map(n => n.id);
  const score = (presta ? 2 : 0) + (TRAVAIL.test(tout) ? 1 : 0) + (tel ? 1 : 0) + (adr?.code_postal ? 1 : 0) + (e.description.length > 40 ? 1 : 0);
  return {
    ...e, presta: presta || 'travaux_divers', nuis, tel, mail, adr, score,
    nom: devinerNom(e.titre, tel), pro: PRO.test(norm(e.titre)),
    coche: !e.deja && score >= 2,
  };
}

export function ImportAgenda() {
  const [debut, setDebut] = useState(dayKey(addDays(new Date(), -730)));
  const [fin, setFin] = useState(dayKey(addDays(new Date(), 365)));
  const [liste, setListe] = useState(null);
  const [att, setAtt] = useState(false);
  const [voir, setVoir] = useState('coches');
  const [ouvert, setOuvert] = useState(null);
  const [avance, setAvance] = useState(null);
  const [relie, setRelie] = useState(true);

  const lire = async () => {
    setAtt(true); setListe(null);
    try {
      const { data, error } = await sb.functions.invoke('agenda', { body: { mode: 'import', debut: new Date(debut + 'T00:00:00').toISOString(), fin: new Date(fin + 'T23:59:59').toISOString() } });
      if (error) throw error;
      if (data?.erreur) throw new Error(data.erreur);
      setRelie(data.relie !== false);
      const evs = data.evenements || [];
      // Déjà repris lors d'un import précédent ? (double vérification côté appli)
      const deja = new Set();
      for (let i = 0; i < evs.length; i += 150) {
        const l = await run(sb.from('passages').select('google_event_id').in('google_event_id', evs.slice(i, i + 150).map(e => e.cle)).is('supprime_le', null));
        l.forEach(x => deja.add(x.google_event_id));
      }
      setListe(evs.map(e => analyser({ ...e, deja: e.deja || deja.has(e.cle) })));
    } catch (e) { erreur(e); }
    setAtt(false);
  };
  const maj = (cle, ch) => setListe(l => l.map(x => x.cle === cle ? { ...x, ...ch } : x));
  const coches = (liste || []).filter(x => x.coche);
  const visibles = (liste || []).filter(x => voir === 'tous' || (voir === 'coches' ? x.coche : !x.coche && !x.deja));

  const enregistrer = async () => {
    const sel = coches.filter(x => x.nom.trim());
    if (sel.length < coches.length) return toast('Donne un nom de client à chaque rendez-vous coché.', true);
    if (!await confirmer(`Créer ${plural(sel.length, 'intervention')} à partir de ton agenda ? Les rendez-vous passés seront marqués « fait ».`, { oui: 'Créer' })) return;
    setAvance({ n: 0, total: sel.length, clients: 0 });
    try {
      const ex = await run(sb.from('clients').select('id,nom_affiche,telephone,email').is('supprime_le', null));
      const sites = await run(sb.from('sites').select('id,client_id,adresse,code_postal').is('supprime_le', null));
      const parTel = new Map(), parMail = new Map(), parNom = new Map();
      const indexer = c => { if (c.telephone) parTel.set(chiffres(c.telephone), c.id); if (c.email) parMail.set(c.email.toLowerCase(), c.id); if (c.nom_affiche) parNom.set(norm(c.nom_affiche).trim(), c.id); };
      ex.forEach(indexer);
      const dossiers = new Map(); // client|prestation → { id, fin } pour suivre un client sur plusieurs passages
      const crees = []; let nbClients = 0;
      const maintenant = Date.now();
      for (const [i, x] of sel.sort((a, b) => a.debut.localeCompare(b.debut)).entries()) {
        // 1 · client (sans doublon : même téléphone, même e-mail ou même nom)
        let cid = (x.tel && parTel.get(chiffres(x.tel))) || (x.mail && parMail.get(x.mail.toLowerCase())) || parNom.get(norm(x.nom).trim());
        if (!cid) {
          const c = await run(sb.from('clients').insert({
            type: x.pro ? 'professionnel' : 'particulier', sous_type: x.pro ? (/syndic|copro/i.test(x.nom) ? 'syndic' : /agence|immobili/i.test(x.nom) ? 'agence_immobiliere' : 'societe') : null,
            nom: x.pro ? null : x.nom.trim(), raison_sociale: x.pro ? x.nom.trim() : null, telephone: x.tel || null, email: x.mail || null,
            adresse: x.adr?.adresse || null, code_postal: x.adr?.code_postal || null, ville: x.adr?.ville || null, source_import: 'google_agenda', cree_par: moi.profil?.id,
          }).select('id,nom_affiche,telephone,email').single());
          cid = c.id; indexer(c); nbClients++;
        }
        // 2 · adresse d'intervention
        let site = null;
        if (x.adr?.adresse) {
          site = sites.find(s => s.client_id === cid && norm(s.adresse) === norm(x.adr.adresse));
          if (!site) {
            site = await run(sb.from('sites').insert({ client_id: cid, nom: sites.some(s => s.client_id === cid) ? null : 'Adresse principale', adresse: x.adr.adresse,
              code_postal: x.adr.code_postal || null, ville: x.adr.ville || null, principal: !sites.some(s => s.client_id === cid) }).select('id,client_id,adresse,code_postal').single());
            sites.push(site);
          }
        }
        // 3 · dossier : un nouveau, ou le même si le client a déjà eu cette prestation dans les 90 jours
        const k = cid + '|' + x.presta, prec = dossiers.get(k);
        let did = prec && (new Date(x.debut) - new Date(prec.fin)) < 90 * 864e5 ? prec.id : null;
        if (!did) {
          const d = await run(sb.from('dossiers').insert({ client_id: cid, site_id: site?.id || null, prestation_code: x.presta, titre: x.titre || null,
            description: x.description || null, responsable_id: moi.profil?.id, cree_par: moi.profil?.id }).select('id').single());
          did = d.id;
          if (x.nuis.length) await run(sb.from('dossiers_nuisibles').insert(x.nuis.map(n => ({ dossier_id: did, nuisible_id: n }))));
        }
        dossiers.set(k, { id: did, fin: x.fin });
        // 4 · passage
        let deb = x.debut, fi = x.fin;
        if (x.jour) { deb = new Date(x.debut.slice(0, 10) + 'T08:00:00').toISOString(); fi = new Date(new Date(deb).getTime() + 3600e3).toISOString(); }
        const passe = new Date(fi).getTime() < maintenant;
        const p = await run(sb.from('passages').insert({
          dossier_id: did, statut: passe ? 'fait' : 'planifie', debut_prevu: deb, fin_prevue: fi, date_cible: dayKey(deb),
          technicien_id: moi.profil?.id, google_event_id: x.cle, constats: passe && x.description ? x.description : null,
          details: { source: 'google_agenda' }, cree_par: moi.profil?.id,
        }).select('id').single());
        if (passe) crees.push(p.id);
        setAvance({ n: i + 1, total: sel.length, clients: nbClients });
      }
      // Pas de rappels en retard pour les anciens rendez-vous (bilan J+35, SMS…)
      for (let i = 0; i < crees.length; i += 100)
        await run(sb.from('rappels').update({ fait_le: new Date().toISOString() }).in('passage_id', crees.slice(i, i + 100)).lt('echeance', dayKey(new Date())).is('fait_le', null));
      viderPerso();
      toast(`${plural(sel.length, 'intervention')} et ${plural(nbClients, 'nouveau client', 'nouveaux clients')} enregistrés`);
      setAvance(null); setListe(l => l.map(x => x.coche ? { ...x, coche: false, deja: true } : x));
    } catch (e) { erreur(e); setAvance(null); }
  };

  // Regroupement par mois pour la lecture
  const groupes = [];
  for (const x of visibles) {
    const d = toDate(x.debut), k = `${MOIS[d.getMonth()]} ${d.getFullYear()}`;
    if (groupes.at(-1)?.k !== k) groupes.push({ k, l: [] });
    groupes.at(-1).l.push(x);
  }
  const prestas = ref.prestations.map(p => [p.code, p.nom]);
  const tous = (liste || []).filter(x => !x.deja);

  return html`<div class="stack">
    <${Titre} sur="Réglages · Google Agenda" actions=${html`<a class="btn ghost sm" href="#/reglages">Retour</a>`}>Reprendre mon agenda<//>
    <div class="card stack">
      <p class="small" style="margin:0">L'appli lit ton agenda Google et te propose de recréer tes interventions. Les rendez-vous qui ressemblent à du travail sont <b>pré-cochés</b> : vérifie, décoche ce qui est perso, corrige le nom du client si besoin, puis enregistre. <b>Rien n'est créé avant que tu valides.</b></p>
      <div class="row">
        <label class="small">Du <input class="inp" style="width:auto" type="date" value=${debut} onInput=${e => setDebut(e.target.value)} /></label>
        <label class="small">au <input class="inp" style="width:auto" type="date" value=${fin} onInput=${e => setFin(e.target.value)} /></label>
        <button class="btn pri" disabled=${att} onClick=${lire}>${liste ? 'Relire' : 'Lire mon agenda'}</button>
      </div>
      ${!relie && html`<div class="infobox small">Ton agenda Google n'est pas encore relié. Va dans <a href="#/reglages">Réglages › Profil › Google Agenda</a> et colle ton « Adresse secrète au format iCal ».</div>`}
    </div>
    ${att && html`<div class="card"><${Chargement} /><p class="small muted" style="text-align:center">Lecture de ton agenda…</p></div>`}
    ${liste && html`<div class="card stack imp-ag">
      <div class="ch" style="margin:0"><h3>${plural(coches.length, 'rendez-vous coché', 'rendez-vous cochés')} sur ${tous.length}</h3>
        <div class="chips">${[['coches', 'Cochés'], ['non', 'Non cochés'], ['tous', 'Tout']].map(([v, l]) => html`<button type="button" aria-pressed=${voir === v} onClick=${() => setVoir(v)}>${l}</button>`)}</div></div>
      <div class="row"><button class="btn sm ghost" onClick=${() => setListe(l => l.map(x => x.deja ? x : { ...x, coche: true }))}>Tout cocher</button>
        <button class="btn sm ghost" onClick=${() => setListe(l => l.map(x => ({ ...x, coche: false })))}>Tout décocher</button>
        <button class="btn sm ghost" onClick=${() => setListe(l => l.map(x => ({ ...x, coche: !x.deja && x.score >= 2 })))}>Revenir au tri automatique</button></div>
      ${!visibles.length && html`<${Vide}>Aucun rendez-vous dans cette liste.<//>`}
      ${groupes.map(g => html`<div class="stack" style="gap:8px"><div class="eyebrow">${g.k}</div>
        ${g.l.map(x => html`<div class=${cls('ia-li', x.coche && 'on', x.deja && 'deja')} style=${`--c:${prestation(x.presta).couleur}`}>
          <label class="ia-case"><input type="checkbox" checked=${x.coche} disabled=${x.deja} onChange=${e => maj(x.cle, { coche: e.target.checked })} /></label>
          <div class="ia-corps">
            <div class="ia-haut"><b>${fmtDay(x.debut)}${x.jour ? '' : ' · ' + fmtTime(x.debut)}</b> <span class="muted">${x.titre}</span>
              ${x.deja && html` <span class="pill ok">déjà dans l'appli</span>`}${x.repete && html` <span class="pill">répété</span>`}</div>
            ${x.coche && html`<div class="ia-champs">
              <input class="inp" value=${x.nom} placeholder="Nom du client" onInput=${e => maj(x.cle, { nom: e.target.value })} />
              <${Choix} value=${x.presta} vide=${false} options=${prestas} onChange=${v => maj(x.cle, { presta: v, nuis: [] })} />
              <label class="small row" style="gap:6px;flex-wrap:nowrap"><input type="checkbox" checked=${x.pro} onChange=${e => maj(x.cle, { pro: e.target.checked })} /> Pro</label>
            </div>`}
            <div class="small muted">${[x.adr && [x.adr.adresse, [x.adr.code_postal, x.adr.ville].filter(Boolean).join(' ')].filter(Boolean).join(', '), x.tel].filter(Boolean).join(' · ')}</div>
            ${x.description && html`<div class="small ia-desc" onClick=${() => setOuvert(ouvert === x.cle ? null : x.cle)}>${ouvert === x.cle ? x.description : x.description.slice(0, 140) + (x.description.length > 140 ? '… (voir tout)' : '')}</div>`}
          </div></div>`)}</div>`)}
      <div class="ia-pied">${avance
        ? html`<div class="okbox">Enregistrement… ${avance.n} / ${avance.total} (${plural(avance.clients, 'nouveau client', 'nouveaux clients')})</div>`
        : html`<button class="btn pri block" disabled=${!coches.length} onClick=${enregistrer}>Créer ${plural(coches.length, 'intervention')}</button>`}</div>
    </div>`}
    ${liste && !avance && tous.length < liste.length && html`<p class="small muted">Les rendez-vous marqués « déjà dans l'appli » ont été repris lors d'un import précédent : ils ne seront pas créés deux fois.</p>`}
  </div>`;
}
