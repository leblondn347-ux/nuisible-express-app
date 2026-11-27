// Réglages : profil, entreprise, logo, Certibiocide, textes types, listes, équipe, sauvegarde ; registre des biocides
import { html, useState, useEffect, Icon, Titre, Chargement, Vide, useCharge, Modal, ouvrir, Texte, Choix, Champ, Pastilles, erreur, toast, confirmer, choisirFichier, useRefData } from '../ui.js';
import { sb, run, moi, ref, estAdmin, chargerRef, envoyerFichier, cheminEntreprise, modifier, urlFichier } from '../db.js';
import { Signature } from './signature.js';
import { fmtDate, dayKey, addDays, telecharger, csv, today, SOUS_TYPES } from '../util.js';
import { VERSION } from '../config.js';
import { pdfRegistre } from '../pdf.js';

let invite = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); invite = e; });

const LISTES = { niveau_infestation: "Niveaux d'infestation", type_poste: 'Types de poste', fixation: 'Fixations', mode_application: "Modes d'application", nature_passage: 'Natures de passage',
  type_nacelle: 'Matériel nacelle', nature_travaux_hauteur: 'Travaux en hauteur', nature_travaux_divers: 'Travaux divers', dispositif_depigeonnage: 'Dispositifs de dépigeonnage', type_document: 'Types de document', precaution_rentree: 'Précautions (délai de rentrée)' };

export function Reglages() {
  useRefData();
  const admin = estAdmin();
  const [onglet, setOnglet] = useState('profil');
  const ong = [['profil', 'Mon profil'], ...(admin ? [['entreprise', 'Entreprise'], ['textes', 'Textes types'], ['listes', 'Listes'], ['equipe', 'Équipe']] : []), ['certibiocide', 'Certibiocide'], ['outils', 'Sauvegarde et outils']];
  return html`
    <${Titre} sur=${'Version ' + VERSION} em="réglages">Mes<//>
    <div class="tabs">${ong.map(([k, l]) => html`<button class=${onglet === k ? 'on' : ''} onClick=${() => setOnglet(k)}>${l}</button>`)}</div>
    ${onglet === 'profil' && html`<${Profil} />`}
    ${onglet === 'entreprise' && html`<${Entreprise} />`}
    ${onglet === 'textes' && html`<${Textes} />`}
    ${onglet === 'listes' && html`<${Listes} />`}
    ${onglet === 'equipe' && html`<${Equipe} />`}
    ${onglet === 'certibiocide' && html`<${Certibiocides} />`}
    ${onglet === 'outils' && html`<${Outils} />`}`;
}

function Profil() {
  const [p, setP] = useState({ ...moi.profil });
  const set = k => v => setP(x => ({ ...x, [k]: v }));
  const go = async () => {
    try { await run(sb.from('profils').update({ prenom: p.prenom || null, nom: p.nom || null, telephone: p.telephone || null }).eq('id', p.id)); Object.assign(moi.profil, p); await chargerRef(); toast('Profil enregistré'); } catch (e) { erreur(e); }
  };
  const signe = async b => { try { const c = cheminEntreprise('profils', p.id, `signature-${Date.now()}.png`); await envoyerFichier('signatures', c, b, 'image/png'); await modifier('profils', p.id, { signature_chemin: c }); moi.profil.signature_chemin = c; toast('Signature enregistrée'); } catch (e) { erreur(e); } };
  const mdp = async () => { const { error } = await sb.auth.resetPasswordForEmail(moi.session.user.email, { redirectTo: location.origin + location.pathname }); error ? erreur(error) : toast('E-mail envoyé pour changer le mot de passe'); };
  return html`<div class="grid2e" style="margin-top:16px">
    <div class="card stack"><h3>Mes informations</h3><div class="form">
      <${Texte} label="Prénom" value=${p.prenom} onInput=${set('prenom')} /><${Texte} label="Nom" value=${p.nom} onInput=${set('nom')} />
      <${Texte} label="Téléphone" type="tel" value=${p.telephone} onInput=${set('telephone')} /><${Champ} label="E-mail de connexion"><p style="margin:10px 0">${moi.session?.user?.email}</p><//></div>
      <div class="row"><button class="btn pri" onClick=${go}>Enregistrer</button><button class="btn ghost" onClick=${mdp}>Changer mon mot de passe</button>
        <button class="btn danger" onClick=${() => sb.auth.signOut()}><${Icon} n="out" />Se déconnecter</button></div></div>
    <div class="card stack"><h3>Ma signature</h3><p class="small muted" style="margin:0">Elle est ajoutée toute seule sur tes rapports.</p>
      <${Signature} chemin=${moi.profil?.signature_chemin} onSigne=${signe} /></div></div>`;
}

function Entreprise() {
  const [e, setE] = useState({ ...moi.entreprise });
  const [logo, setLogo] = useState(null);
  useEffect(() => { if (e.logo_chemin) urlFichier('entreprise', e.logo_chemin).then(setLogo); }, [e.logo_chemin]);
  const set = k => v => setE(x => ({ ...x, [k]: v }));
  const go = async () => {
    try {
      const ch = { nom: e.nom, siret: e.siret || null, numero_certibiocide: e.numero_certibiocide || null, adresse: e.adresse || null, code_postal: e.code_postal || null, ville: e.ville || null, telephone: e.telephone || null, email: e.email || null, site_web: e.site_web || null };
      await run(sb.from('entreprises').update(ch).eq('id', e.id)); await chargerRef(); toast('Entreprise enregistrée');
    } catch (er) { erreur(er); }
  };
  const changerLogo = async () => {
    const [f] = await choisirFichier({ accept: 'image/png,image/jpeg,image/webp,image/svg+xml' }); if (!f) return;
    try { const c = `${e.id}/logo-${Date.now()}.${f.name.split('.').pop()}`; await envoyerFichier('entreprise', c, f); await run(sb.from('entreprises').update({ logo_chemin: c }).eq('id', e.id)); setE(x => ({ ...x, logo_chemin: c })); await chargerRef(); toast('Logo enregistré'); } catch (er) { erreur(er); }
  };
  return html`<div class="grid2" style="margin-top:16px">
    <div class="card stack"><h3>Coordonnées (en-tête des rapports)</h3><div class="form">
      <${Texte} label="Nom" full value=${e.nom} onInput=${set('nom')} />
      <${Texte} label="Adresse" full value=${e.adresse} onInput=${set('adresse')} />
      <${Texte} label="Code postal" value=${e.code_postal} onInput=${set('code_postal')} /><${Texte} label="Ville" value=${e.ville} onInput=${set('ville')} />
      <${Texte} label="Téléphone" value=${e.telephone} onInput=${set('telephone')} /><${Texte} label="E-mail" value=${e.email} onInput=${set('email')} />
      <${Texte} label="SIRET" value=${e.siret} onInput=${set('siret')} /><${Texte} label="N° Certibiocide entreprise" value=${e.numero_certibiocide} onInput=${set('numero_certibiocide')} />
      <${Texte} label="Site internet" full value=${e.site_web} onInput=${set('site_web')} /></div>
      <button class="btn pri" style="align-self:flex-start" onClick=${go}>Enregistrer</button></div>
    <div class="card stack"><h3>Logo</h3>
      ${logo ? html`<img src=${logo} alt="Logo" style="max-height:120px;object-fit:contain;background:#fff;border-radius:12px;padding:10px" />` : html`<p class="muted small" style="margin:0">Pas encore de logo : le nom s'affiche en texte.</p>`}
      <button class="btn" onClick=${changerLogo}><${Icon} n="up" />${logo ? 'Changer le logo' : 'Ajouter mon logo'}</button></div></div>`;
}

function Textes() {
  const [l, recharger] = useCharge(() => run(sb.from('modeles_textes').select('*').order('code')));
  const [sel, setSel] = useState(null);
  if (!l) return html`<${Chargement} />`;
  const go = async () => {
    try {
      const row = { code: sel.code, titre: sel.titre, objet: sel.objet || null, contenu: sel.contenu || '', actif: sel.actif !== false, entreprise_id: moi.profil.entreprise_id };
      sel.id ? await run(sb.from('modeles_textes').update(row).eq('id', sel.id)) : await run(sb.from('modeles_textes').insert(row));
      toast('Texte enregistré'); setSel(null); recharger(); chargerRef();
    } catch (e) { erreur(e); }
  };
  return html`<div class="grid2e" style="margin-top:16px">
    <div class="card"><div class="ch"><h3>Textes types</h3><button class="link" onClick=${() => setSel({ code: 'recommandation_' + Date.now().toString(36), titre: 'Nouvelle recommandation', contenu: '' })}>+ Recommandation type</button></div>
      ${l.map(m => html`<button class="lieu" style="width:100%;background:none;border-left:0;border-right:0;border-bottom:0;text-align:left;cursor:pointer" onClick=${() => setSel({ ...m })}><div><b>${m.titre}</b><div class="small muted">${(m.contenu || '').slice(0, 70)}…</div></div><${Icon} n="pen" /></button>`)}</div>
    ${sel ? html`<div class="card stack"><h3>${sel.titre}</h3>
      <${Texte} label="Titre" value=${sel.titre} onInput=${v => setSel({ ...sel, titre: v })} />
      ${(sel.objet != null || sel.code?.startsWith('email')) && html`<${Texte} label="Objet de l'e-mail" value=${sel.objet} onInput=${v => setSel({ ...sel, objet: v })} />`}
      <${Texte} label="Texte" rows="10" value=${sel.contenu} onInput=${v => setSel({ ...sel, contenu: v })} />
      <p class="small muted" style="margin:0">Mots remplacés tout seuls : {client} {date} {heure} {adresse} {reference} {prestation} {telephone_entreprise} {prochain_passage} {consignes}</p>
      <div class="row"><button class="btn pri" onClick=${go}>Enregistrer</button><button class="btn ghost" onClick=${() => setSel(null)}>Annuler</button></div></div>`
    : html`<div class="card"><${Vide}>Choisis un texte à modifier : e-mails de confirmation, d'envoi de rapport, avis de passage, recommandations…<//></div>`}</div>`;
}

function Listes() {
  const [nom, setNom] = useState('niveau_infestation');
  const [l, recharger] = useCharge(() => run(sb.from('listes_choix').select('*').eq('liste', nom).order('ordre')), [nom]);
  const [val, setVal] = useState('');
  const [nuis, setNuis] = useState({ prestation_code: 'deratisation', parent_id: '', nom: '' });
  const ajouter = async () => {
    if (!val.trim()) return;
    try { await run(sb.from('listes_choix').insert({ liste: nom, valeur: val.trim(), ordre: (l?.length || 0) + 1, entreprise_id: moi.profil.entreprise_id })); setVal(''); recharger(); chargerRef(); } catch (e) { erreur(e); }
  };
  const masquer = async x => { try { await run(sb.from('listes_choix').update({ actif: !x.actif }).eq('id', x.id)); recharger(); chargerRef(); } catch (e) { erreur(e); } };
  const ajoutNuis = async () => {
    if (!nuis.nom.trim()) return;
    try { await run(sb.from('nuisibles').insert({ prestation_code: nuis.prestation_code, parent_id: nuis.parent_id || null, nom: nuis.nom.trim(), ordre: 99, entreprise_id: moi.profil.entreprise_id })); setNuis({ ...nuis, nom: '' }); await chargerRef(); toast('Nuisible ajouté'); } catch (e) { erreur(e); }
  };
  return html`<div class="grid2e" style="margin-top:16px">
    <div class="card stack"><h3>Listes de choix</h3>
      <${Choix} vide=${false} value=${nom} onChange=${setNom} options=${Object.entries(LISTES)} />
      ${!l ? html`<${Chargement} />` : html`<div class="opts">${l.map(x => html`<span class="opt" style=${x.actif ? '' : 'opacity:.5;text-decoration:line-through'}>${x.valeur}
        ${x.entreprise_id && html`<button class="link small" onClick=${() => masquer(x)}>${x.actif ? 'masquer' : 'remettre'}</button>`}</span>`)}</div>`}
      <div class="row"><input class="inp" style="flex:1" placeholder="Nouvelle valeur" value=${val} onInput=${e => setVal(e.target.value)} onKeyDown=${e => e.key === 'Enter' && ajouter()} /><button class="btn" onClick=${ajouter}>Ajouter</button></div>
      <p class="small muted" style="margin:0">Les valeurs de départ restent ; tes ajouts peuvent être masqués.</p></div>
    <div class="card stack"><h3>Ajouter un nuisible</h3>
      <${Choix} label="Prestation" vide=${false} value=${nuis.prestation_code} onChange=${v => setNuis({ ...nuis, prestation_code: v, parent_id: '' })} options=${ref.prestations.map(p => [p.code, p.nom])} />
      <${Choix} label="Sous-catégorie de" vide="(catégorie principale)" value=${nuis.parent_id} onChange=${v => setNuis({ ...nuis, parent_id: v || '' })} options=${ref.nuisibles.filter(n => n.prestation_code === nuis.prestation_code && !n.parent_id).map(n => [n.id, n.nom])} />
      <${Texte} label="Nom" value=${nuis.nom} onInput=${v => setNuis({ ...nuis, nom: v })} placeholder="ex. Frelon asiatique" />
      <button class="btn" style="align-self:flex-start" onClick=${ajoutNuis}>Ajouter</button></div></div>`;
}

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const nouveauCode = () => { const r = crypto.getRandomValues(new Uint8Array(8)); const c = [...r].map(x => ALPHA[x % ALPHA.length]).join(''); return c.slice(0, 4) + '-' + c.slice(4); };
const lienAppli = () => location.origin + location.pathname;

async function partagerCode(c) {
  const texte = `Bonjour, voici ton accès à l'appli ${moi.entreprise?.nom || 'Nuisible Express 34'}${c.espace === 'demo' ? ' (démonstration)' : ''} :\n1. Ouvre ${lienAppli()}\n2. Clique sur « Créer mon compte »\n3. Tape ton e-mail, un mot de passe et le code : ${c.code}`;
  if (navigator.share) { try { await navigator.share({ text: texte }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(texte); toast('Message copié : colle-le dans un SMS ou un e-mail'); } catch (e) { toast(texte); }
}

function Equipe() {
  const [d, recharger] = useCharge(async () => ({
    profils: await run(sb.from('profils').select('*')),
    codes: await run(sb.from('codes_acces').select('*').order('cree_le', { ascending: false })),
    inv: await run(sb.from('invitations').select('*').order('cree_le', { ascending: false })),
  }));
  const [f, setF] = useState({ libelle: '', espace: 'entreprise' });
  if (!d) return html`<${Chargement} />`;
  const creer = async () => {
    if (!f.libelle.trim()) return toast('Donne un nom au code (ex. le prénom du salarié).', true);
    try { await run(sb.from('codes_acces').insert({ libelle: f.libelle.trim(), espace: f.espace, code: nouveauCode() })); setF({ libelle: '', espace: f.espace }); recharger(); toast('Code créé'); } catch (e) { erreur(e); }
  };
  const basculer = async c => {
    if (c.actif && !await confirmer(`Bloquer le code « ${c.libelle} » ? Les personnes entrées avec ce code n'auront plus accès à l'appli, tout de suite.`, { titre: 'Bloquer le code', oui: 'Bloquer', danger: true })) return;
    try { await run(sb.from('codes_acces').update({ actif: !c.actif }).eq('id', c.id)); recharger(); toast(c.actif ? 'Code bloqué' : 'Code débloqué'); } catch (e) { erreur(e); }
  };
  const comptes = id => d.profils.filter(p => p.code_acces_id === id);
  const nomP = p => [p.prenom, p.nom].filter(Boolean).join(' ') || p.email;
  const libCode = id => d.codes.find(c => c.id === id)?.libelle;
  return html`<div class="grid2e" style="margin-top:16px">
    <div class="card stack"><h3>Codes d'accès</h3>
      <p class="small muted" style="margin:0">Crée un code par personne. Elle ouvre l'appli, clique sur « Créer mon compte » et tape le code. Tu peux bloquer un code à tout moment.</p>
      <div class="form">
        <${Texte} label="Nom du code" value=${f.libelle} onInput=${v => setF({ ...f, libelle: v })} placeholder="ex. Kevin, Démo Jean" />
        <${Champ} label="Accès à" full><${Pastilles} multi=${false} valeurs=${f.espace} onChange=${v => v && setF({ ...f, espace: v })} options=${[['entreprise', 'Mes vrais clients (salarié)'], ['demo', 'Démo avec faux clients']]} /><//>
      </div>
      <button class="btn pri" style="align-self:flex-start" onClick=${creer}><${Icon} n="plus" />Créer le code</button>
      ${d.codes.length === 0 ? html`<${Vide}>Aucun code pour l'instant.<//>` : d.codes.map(c => html`<div class="lieu" style="align-items:flex-start;gap:10px">
        <div style="flex:1;min-width:0"><b>${c.libelle}</b> <span class=${'pill ' + (c.actif ? 'ok' : 'bad')}>${c.actif ? 'actif' : 'bloqué'}</span>
          <div style="font-family:monospace;font-size:1.15rem;letter-spacing:.08em;margin:4px 0">${c.code}</div>
          <div class="small muted">${c.espace === 'demo' ? 'Démo (faux clients)' : 'Vrais clients'} · ${comptes(c.id).length ? comptes(c.id).map(nomP).join(', ') : c.derniere_utilisation ? 'utilisé le ' + fmtDate(c.derniere_utilisation) : 'pas encore utilisé'}</div></div>
        <div class="stack" style="gap:6px">
          <button class="btn sm" onClick=${() => partagerCode(c)}>Envoyer</button>
          <button class=${'btn sm ' + (c.actif ? 'ghost' : 'pri')} onClick=${() => basculer(c)}>${c.actif ? 'Bloquer' : 'Débloquer'}</button></div></div>`)}
    </div>
    <div class="card"><div class="ch"><h3>Comptes</h3></div>${d.profils.map(p => html`<div class="lieu"><div><b>${nomP(p)}</b><div class="small muted">${p.email} · ${p.role === 'admin' ? 'Administrateur' : 'Technicien'}${p.code_acces_id ? ' · code « ' + (libCode(p.code_acces_id) || '?') + ' »' : ''}${p.actif ? '' : ' · bloqué'}</div></div></div>`)}
      ${d.inv.length > 0 && html`<h4 style="margin:14px 0 4px">Anciennes invitations par e-mail</h4>${d.inv.map(i => html`<div class="small">${i.email} · ${i.utilisee_le ? 'compte créé le ' + fmtDate(i.utilisee_le) : 'en attente'}</div>`)}`}</div></div>`;
}

function Certibiocides() {
  const [l, recharger] = useCharge(() => run(sb.from('certibiocides').select('*').order('date_fin')));
  const [f, setF] = useState(null);
  if (!l) return html`<${Chargement} />`;
  const go = async () => {
    try {
      const row = { titulaire: f.titulaire, numero: f.numero || null, types_produits: (f.types || '').split(/[,; ]+/).filter(Boolean), date_obtention: f.date_obtention || null, date_fin: f.date_fin || null, profil_id: f.profil_id || moi.profil.id };
      f.id ? await run(sb.from('certibiocides').update(row).eq('id', f.id)) : await run(sb.from('certibiocides').insert(row));
      toast('Certibiocide enregistré : rappel 3 mois avant la fin'); setF(null); recharger();
    } catch (e) { erreur(e); }
  };
  return html`<div class="grid2e" style="margin-top:16px">
    <div class="card"><div class="ch"><h3>Certibiocide</h3><button class="link" onClick=${() => setF({ titulaire: [moi.profil.prenom, moi.profil.nom].filter(Boolean).join(' '), numero: moi.entreprise?.numero_certibiocide || '', types: 'TP14, TP18, TP20' })}>+ Ajouter</button></div>
      ${l.length === 0 ? html`<${Vide}>Ajoute ton Certibiocide : l'appli te préviendra 3 mois avant la fin de validité.<//>` : l.map(c => html`<button class="lieu" style="width:100%;background:none;border-left:0;border-right:0;border-bottom:0;text-align:left;cursor:pointer" onClick=${() => setF({ ...c, types: (c.types_produits || []).join(', ') })}>
        <div><b>${c.titulaire}</b><div class="small muted">${c.numero || ''} · ${(c.types_produits || []).join(', ')}</div></div>
        <span class=${'pill ' + (c.date_fin && c.date_fin < dayKey(addDays(new Date(), 90)) ? 'warn' : 'ok')}>${c.date_fin ? "jusqu'au " + fmtDate(c.date_fin) : 'date à préciser'}</span></button>`)}</div>
    ${f && html`<div class="card stack"><h3>${f.id ? 'Modifier' : 'Nouveau'}</h3><div class="form">
      <${Texte} label="Titulaire" value=${f.titulaire} onInput=${v => setF({ ...f, titulaire: v })} /><${Texte} label="Numéro" value=${f.numero} onInput=${v => setF({ ...f, numero: v })} />
      <${Texte} label="Types de produits" full value=${f.types} onInput=${v => setF({ ...f, types: v })} />
      <${Texte} label="Obtenu le" type="date" value=${f.date_obtention} onInput=${v => setF({ ...f, date_obtention: v, date_fin: f.date_fin || (v ? dayKey(addDays(v, 5 * 365)) : '') })} />
      <${Texte} label="Valable jusqu'au" type="date" value=${f.date_fin} onInput=${v => setF({ ...f, date_fin: v })} /></div>
      <div class="row"><button class="btn pri" onClick=${go}>Enregistrer</button><button class="btn ghost" onClick=${() => setF(null)}>Annuler</button></div></div>`}</div>`;
}

const TABLES = ['entreprises', 'profils', 'clients', 'sites', 'contrats', 'contrats_nuisibles', 'dossiers', 'dossiers_nuisibles', 'passages', 'passages_produits', 'plans', 'postes', 'releves_postes', 'releves_produits',
  'photos', 'documents', 'envois', 'rappels', 'produits', 'produits_nuisibles', 'nuisibles', 'listes_choix', 'modeles_textes', 'certibiocides', 'invitations'];
function Outils() {
  const [att, setAtt] = useState(null);
  const sauvegarde = async () => {
    setAtt('Sauvegarde en cours…');
    try {
      const out = { date: new Date().toISOString(), version: VERSION };
      for (const t of TABLES) {
        const rows = []; let i = 0;
        while (true) { const { data, error } = await sb.from(t).select('*').range(i, i + 999); if (error) { if (/permission|row-level/.test(error.message)) break; throw error; } rows.push(...data); if (data.length < 1000) break; i += 1000; }
        out[t] = rows; setAtt(`Sauvegarde : ${t}…`);
      }
      telecharger(new Blob([JSON.stringify(out)], { type: 'application/json' }), `sauvegarde-nuisible-express-${today()}.json`);
      localStorage.setItem('ne34-derniere-sauvegarde', today()); toast('Sauvegarde téléchargée');
    } catch (e) { erreur(e); }
    setAtt(null);
  };
  const exportClients = async () => {
    try {
      const c = await run(sb.from('clients').select('*').is('supprime_le', null).order('nom_affiche'));
      telecharger(new Blob(['﻿' + csv([['Nom', 'Type', 'Catégorie', 'Contact', 'Téléphone', 'E-mail', 'Adresse', 'Code postal', 'Ville', 'Remarques'],
        ...c.map(x => [x.nom_affiche, x.type, x.sous_type ? SOUS_TYPES[x.sous_type] : '', x.contact_nom, x.telephone, x.email, x.adresse, x.code_postal, x.ville, x.remarques])])], { type: 'text/csv' }), `clients-${today()}.csv`);
    } catch (e) { erreur(e); }
  };
  const der = localStorage.getItem('ne34-derniere-sauvegarde');
  return html`<div class="grid2e" style="margin-top:16px">
    <div class="card stack"><h3>Sauvegarde</h3>
      <p class="small" style="margin:0">La formule gratuite de la base ne fait pas de sauvegarde automatique. Télécharge une copie complète de tes données de temps en temps (une fois par semaine par exemple) et range-la sur ton ordinateur.</p>
      <p class="small muted" style="margin:0">Dernière sauvegarde depuis cet appareil : ${der ? fmtDate(der) : 'jamais'}</p>
      <button class="btn pri" disabled=${!!att} onClick=${sauvegarde}><${Icon} n="dl" />${att || 'Télécharger une sauvegarde complète'}</button>
      <button class="btn ghost" onClick=${exportClients}><${Icon} n="dl" />Exporter mes clients (Excel / CSV)</button></div>
    <div class="card stack"><h3>Outils</h3>
      <a class="btn ghost" href="#/registre"><${Icon} n="book" />Registre des produits biocides</a>
      ${invite ? html`<button class="btn" onClick=${async () => { invite.prompt(); invite = null; }}><${Icon} n="dl" />Installer l'appli sur cet appareil</button>`
        : html`<p class="small muted" style="margin:0">Pour installer l'appli : dans Chrome, menu ⋮ puis « Ajouter à l'écran d'accueil » (téléphone) ou l'icône d'installation dans la barre d'adresse (ordinateur).</p>`}
      <p class="small muted" style="margin:0">Google Agenda : chaque intervention a un bouton « Google Agenda » pour l'y ajouter.</p></div></div>`;
}

export function Registre() {
  const [du, setDu] = useState(dayKey(new Date(new Date().getFullYear(), 0, 1)));
  const [au, setAu] = useState(today());
  const [l] = useCharge(() => run(sb.from('v_registre_biocides').select('*').gte('date_utilisation', du).lte('date_utilisation', au + 'T23:59:59').order('date_utilisation')), [du, au]);
  const exp = () => telecharger(new Blob(['﻿' + csv([['Date', 'Dossier', 'Client', 'Adresse', 'Ville', 'Produit', 'N° AMM', 'Type', 'Lot', 'Quantité', 'Unité', 'Usage'],
    ...(l || []).map(x => [fmtDate(x.date_utilisation), x.reference, x.client, x.adresse, x.ville, x.produit, x.numero_amm, x.type_biocide, x.numero_lot, x.quantite, x.unite, x.methode])])], { type: 'text/csv' }), `registre-biocides-${du}-${au}.csv`);
  const pdf = async () => { try { telecharger(await pdfRegistre(l || [], du, au), `registre-biocides-${du}-${au}.pdf`); } catch (e) { erreur(e); } };
  return html`
    <${Titre} sur="Pour un contrôle" em="biocides">Registre des<//>
    <div class="row"><${Texte} label="Du" type="date" value=${du} onInput=${setDu} /><${Texte} label="Au" type="date" value=${au} onInput=${setAu} />
      <button class="btn ghost" style="align-self:flex-end" onClick=${exp}><${Icon} n="dl" />Excel (CSV)</button><button class="btn pri" style="align-self:flex-end" onClick=${pdf}><${Icon} n="dl" />PDF</button></div>
    <div class="card" style="padding:8px 12px">${!l ? html`<${Chargement} />` : l.length === 0 ? html`<${Vide}>Aucun produit utilisé sur cette période (interventions terminées).<//>` : html`<div class="tblwrap"><table class="tbl">
      <thead><tr><th>Date</th><th>Client</th><th>Produit</th><th>N° AMM</th><th>Lot</th><th>Quantité</th><th>Usage</th></tr></thead><tbody>
      ${l.map(x => html`<tr><td class="num">${fmtDate(x.date_utilisation)}</td><td>${x.client}<div class="small muted">${x.ville || ''}</div></td><td>${x.produit}</td><td>${x.numero_amm || '—'}</td><td>${x.numero_lot || ''}</td><td>${x.quantite != null ? x.quantite + ' ' + (x.unite || '') : ''}</td><td class="small">${x.methode || ''}</td></tr>`)}</tbody></table></div>`}</div>`;
}
