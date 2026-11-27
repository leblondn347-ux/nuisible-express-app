// Postes d'appâtage : plan (plan d'évacuation ou vue aérienne), relevés TC / PC / NC, état, appâts
import { html, useState, useEffect, useRef, Icon, Chargement, Vide, Modal, ouvrir, Texte, Choix, TexteListe, Champ, Pastilles, Bascule, erreur, toast, confirmer, choisirFichier } from '../ui.js';
import { sb, run, moi, ref, liste, produit, modifier, ajouter, envoyerFichier, urlFichier, cheminEntreprise } from '../db.js';
import { adresseDe } from '../data.js';
import { nomProduit } from './nouvelle.js';
import { ETATS_POSTE, CATEGORIES_POSTE, fmtDate, reduireImage, uuid, cls, today, differe } from '../util.js';

const appats = () => ref.produits.filter(p => p.actif && ((p.types_tp || []).includes('TP14') || /TP14|rodenticide|raticide/i.test(p.type_biocide || '') || /placebo|non toxique/i.test(p.nom)));

export function OngletPostes({ d, p }) {
  const [site, setSite] = useState(d.site);
  const [plans, setPlans] = useState(null);
  const [postes, setPostes] = useState([]);
  const [rel, setRel] = useState({});
  const [planId, setPlanId] = useState(null);
  const [mode, setMode] = useState(null);
  const [sel, setSel] = useState(null);
  const [img, setImg] = useState(null);
  const [filtre, setFiltre] = useState('tous');

  const charger = async () => {
    if (!site) return setPlans([]);
    const [pl, po] = await Promise.all([
      run(sb.from('plans').select('*').eq('site_id', site.id).is('supprime_le', null).order('ordre')),
      run(sb.from('postes').select('*').eq('site_id', site.id).is('supprime_le', null).eq('actif', true).order('numero')),
    ]);
    let rv = await run(sb.from('releves_postes').select('*, releves_produits(*)').eq('passage_id', p.id));
    if (!rv.length && po.length && !p.verrouille) {
      await run(sb.rpc('preparer_releves', { p_passage: p.id }));
      rv = await run(sb.from('releves_postes').select('*, releves_produits(*)').eq('passage_id', p.id));
    }
    setPlans(pl); setPostes(po); setRel(Object.fromEntries(rv.map(r => [r.poste_id, r])));
    setPlanId(x => x || pl[0]?.id || null);
  };
  useEffect(() => { charger().catch(erreur); }, [site?.id]);
  const plan = (plans || []).find(x => x.id === planId);
  useEffect(() => { setImg(null); if (plan?.image_chemin) urlFichier('plans', plan.image_chemin).then(setImg); }, [plan?.image_chemin]);

  const creerSite = async () => {
    try {
      const c = d.client;
      const s = await run(sb.from('sites').insert({ client_id: c.id, nom: 'Adresse principale', adresse: c.adresse || 'Adresse à préciser', code_postal: c.code_postal, ville: c.ville, latitude: c.latitude, longitude: c.longitude, principal: true }).select().single());
      await run(sb.from('dossiers').update({ site_id: s.id }).eq('id', d.dossier.id));
      d.site = s; d.dossier.site_id = s.id; setSite(s);
    } catch (e) { erreur(e); }
  };
  if (!site) return html`<div class="card" style="margin-top:18px"><${Vide}>Les postes sont rattachés à un lieu. Ce dossier n'a pas encore de lieu.<br />
    <button class="btn pri" style="margin-top:12px" onClick=${creerSite}>Utiliser l'adresse du client (${adresseDe(d.client) || 'à préciser'})</button><//></div>`;
  if (!plans) return html`<${Chargement} />`;

  // ----- Relevés -----
  const majReleve = async (po, ch) => {
    const r = rel[po.id];
    try {
      if (r) { Object.assign(r, ch); setRel(x => ({ ...x })); await modifier('releves_postes', r.id, ch); return r; }
      const n = await ajouter('releves_postes', { passage_id: p.id, poste_id: po.id, etat: 'en_place', type_appatage: 'biocide', ...ch });
      n.releves_produits = []; setRel(x => ({ ...x, [po.id]: n })); return n;
    } catch (e) { erreur(e); }
  };
  const majAppat = async (po, ch) => {
    const r = rel[po.id] || await majReleve(po, {});
    if (!r) return;
    const rp = r.releves_produits?.[0];
    if (ch.produit_id !== undefined) { const pr = produit(ch.produit_id); ch.numero_amm = pr?.numero_amm || null; ch.unite = pr?.unite || rp?.unite || null; }
    try {
      if (rp) { Object.assign(rp, ch); setRel(x => ({ ...x })); differe('rp-' + rp.id, () => modifier('releves_produits', rp.id, { produit_id: rp.produit_id, numero_amm: rp.numero_amm, numero_lot: rp.numero_lot, quantite: rp.quantite, unite: rp.unite }).catch(erreur)); }
      else { const n = await ajouter('releves_produits', { releve_id: r.id, ...ch }); r.releves_produits = [n]; setRel(x => ({ ...x })); }
    } catch (e) { erreur(e); }
  };

  // ----- Postes et plan -----
  const prochainNumero = () => Math.max(0, ...postes.map(x => x.numero)) + 1;
  const nouveauPoste = async (x, y) => {
    try {
      const prec = postes.at(-1);
      const po = await ajouter('postes', { site_id: site.id, plan_id: x != null ? planId : null, numero: prochainNumero(), position_x: x ?? null, position_y: y ?? null,
        categorie: prec?.categorie || 'rongeurs', type_poste: prec?.type_poste || null, produit_habituel_id: prec?.produit_habituel_id || null, date_pose: today() });
      po.nom = 'Poste ' + po.numero;
      setPostes(l => [...l, po]); setSel(po.id);
      const r = await ajouter('releves_postes', { passage_id: p.id, poste_id: po.id, etat: 'en_place', type_appatage: 'biocide' });
      r.releves_produits = [];
      if (po.produit_habituel_id) { const pr = produit(po.produit_habituel_id); r.releves_produits = [await ajouter('releves_produits', { releve_id: r.id, produit_id: pr.id, numero_amm: pr.numero_amm, unite: pr.unite })]; }
      setRel(m => ({ ...m, [po.id]: r }));
      toast(`Poste ${po.numero} ajouté`);
    } catch (e) { erreur(e); }
  };
  const clicPlan = e => {
    if (!mode) return;
    const b = e.currentTarget.getBoundingClientRect();
    const x = +((e.clientX - b.left) / b.width * 100).toFixed(2), y = +((e.clientY - b.top) / b.height * 100).toFixed(2);
    if (mode === 'ajout') nouveauPoste(x, y);
    if (mode === 'deplacer' && sel) {
      setPostes(l => l.map(po => po.id === sel ? { ...po, position_x: x, position_y: y, plan_id: planId } : po));
      modifier('postes', sel, { position_x: x, position_y: y, plan_id: planId }).catch(erreur); setMode(null); toast('Poste déplacé');
    }
  };
  const ajoutPlan = async () => { const r = await ouvrir(FormPlan, { site, ordre: plans.length }); if (r) { setPlans(l => [...l, r]); setPlanId(r.id); } };
  const modifPoste = async po => { const r = await ouvrir(FormPoste, { po }); if (r === 'retire') { setPostes(l => l.filter(x => x.id !== po.id)); } else if (r) setPostes(l => l.map(x => x.id === r.id ? r : x)); };
  const histo = po => ouvrir(Historique, { po });

  const rs = postes.map(po => rel[po.id]).filter(Boolean);
  const nb = v => rs.filter(r => r.consommation === v).length;
  const nbE = v => rs.filter(r => r.etat === v).length;
  const visibles = postes.filter(po => filtre === 'tous' || (filtre === 'plan' && po.plan_id === planId) || (filtre === 'arelever' && !rel[po.id]?.consommation && !['casse', 'absent'].includes(rel[po.id]?.etat)));
  const liste_appats = appats().length ? appats() : ref.produits.filter(x => x.actif);
  const clsMk = po => cls('mk', po.categorie === 'insectes' && 'ins', po.categorie === 'controle' && 'ctl', ['casse', 'absent'].includes(rel[po.id]?.etat) && 'bad', sel === po.id && 'sel');

  return html`<div class="stack" style="margin-top:18px">
    <div class="card" style="padding:14px 18px"><div class="row between">
      <div class="row small"><b>${postes.length} poste(s)</b>
        <span class="pill bad">TC ${nb('TC')}</span><span class="pill warn">PC ${nb('PC')}</span><span class="pill ok">NC ${nb('NC')}</span>
        ${nbE('casse') > 0 && html`<span class="pill bad">${nbE('casse')} cassé(s)</span>`}${nbE('absent') > 0 && html`<span class="pill bad">${nbE('absent')} absent(s)</span>`}
        ${postes.length - rs.filter(r => r.consommation || ['casse', 'absent'].includes(r.etat)).length > 0 && html`<span class="pill">${postes.length - rs.filter(r => r.consommation || ['casse', 'absent'].includes(r.etat)).length} à relever</span>`}</div>
      <span class="small muted">${site.nom || ''} · ${adresseDe(site)}</span></div></div>
    <div class="postes">
      <div class="card stack">
        <div class="ch" style="margin:0"><h3>Plan</h3><div class="row">
          ${plans.length > 1 && html`<${Pastilles} multi=${false} valeurs=${planId} onChange=${v => v && setPlanId(v)} options=${plans.map(x => [x.id, x.nom])} />`}
          <button class="link" onClick=${ajoutPlan}>+ Plan</button></div></div>
        ${plan ? html`<div class=${cls('planbox', mode && 'adding')}>
            <div class="pl" onClick=${clicPlan}>
              ${img ? html`<img src=${img} alt=${plan.nom} draggable="false" />` : html`<div class="noimg">${plan.image_chemin ? 'Chargement du plan…' : 'Pas d’image pour ce plan'}</div>`}
              ${postes.filter(po => po.plan_id === plan.id && po.position_x != null).map(po => html`<button class=${clsMk(po)} style=${`left:${po.position_x}%;top:${po.position_y}%`}
                onClick=${e => { if (!mode) { e.stopPropagation(); setSel(po.id); document.getElementById('poste-' + po.id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } }} aria-label=${'Poste ' + po.numero}>${po.numero}</button>`)}
            </div></div>
          <div class="row">
            <button class=${cls('btn sm', mode === 'ajout' ? 'pri' : 'ghost')} onClick=${() => setMode(mode === 'ajout' ? null : 'ajout')}><${Icon} n="plus" />${mode === 'ajout' ? 'Touche le plan pour placer (terminer)' : 'Placer des postes'}</button>
            ${sel && html`<button class=${cls('btn sm', mode === 'deplacer' ? 'pri' : 'ghost')} onClick=${() => setMode(mode === 'deplacer' ? null : 'deplacer')}>${mode === 'deplacer' ? 'Touche le nouvel endroit' : `Déplacer le poste ${postes.find(x => x.id === sel)?.numero}`}</button>`}
          </div>`
        : html`<${Vide}>Ajoute un plan : photo du plan d'évacuation, ou capture de la vue satellite pour un jardin.<br /><button class="btn pri sm" style="margin-top:10px" onClick=${ajoutPlan}><${Icon} n="plus" />Ajouter un plan</button><//>`}
      </div>
      <div class="card">
        <div class="ch"><h3>Relevés</h3><div class="row">
          <${Pastilles} multi=${false} valeurs=${filtre} onChange=${v => setFiltre(v || 'tous')} options=${[['tous', 'Tous'], ['arelever', 'À relever'], ...(plan ? [['plan', 'Ce plan']] : [])]} />
          <button class="btn sm" onClick=${() => nouveauPoste()}><${Icon} n="plus" />Poste</button></div></div>
        ${visibles.length === 0 ? html`<${Vide}>${postes.length ? 'Tous les postes sont relevés. 👍' : 'Aucun poste. Place-les sur le plan ou ajoute-les ici.'}<//>` : visibles.map(po => {
          const r = rel[po.id] || {}, rp = r.releves_produits?.[0] || {};
          return html`<div class=${cls('prow', sel === po.id && 'sel')} id=${'poste-' + po.id}>
            <button class="n" onClick=${() => setSel(po.id)} style=${po.categorie !== 'rongeurs' ? `background:${po.categorie === 'insectes' ? '#3F9B5A' : '#3B7DD8'};color:#fff` : ''}>${po.numero}</button>
            <div style="min-width:0"><div class="l">${po.emplacement || po.nom || 'Poste ' + po.numero}</div><div class="s">${[CATEGORIES_POSTE[po.categorie], po.type_poste].filter(Boolean).join(' · ')}</div></div>
            <div class="cs">${['TC', 'PC', 'NC'].map(v => html`<button data-v=${v} aria-pressed=${r.consommation === v} onClick=${() => majReleve(po, { consommation: r.consommation === v ? null : v })} title=${{ TC: 'Totalement consommé', PC: 'Partiellement consommé', NC: 'Non consommé' }[v]}>${v}</button>`)}</div>
            <div class="x"><div class="etat">${ETATS_POSTE.map(([k, l]) => html`<button class=${['casse', 'absent'].includes(k) ? 'b' : ''} aria-pressed=${(r.etat || 'en_place') === k} onClick=${() => majReleve(po, { etat: k })}>${l}</button>`)}</div></div>
            <div class="x">
              <select value=${rp.produit_id || ''} onChange=${e => majAppat(po, { produit_id: e.target.value || null })} aria-label="Appât" style="flex:1 1 160px">
                <option value="">Appât…</option>${liste_appats.map(x => html`<option value=${x.id} selected=${rp.produit_id === x.id}>${nomProduit(x)}</option>`)}</select>
              <input value=${rp.numero_amm || ''} placeholder="N° AMM" onInput=${e => majAppat(po, { numero_amm: e.target.value || null })} style="width:130px" aria-label="N° AMM" />
              <input type="number" step="any" value=${rp.quantite ?? ''} placeholder="Qté" onInput=${e => majAppat(po, { quantite: e.target.value === '' ? null : +e.target.value })} style="width:70px" aria-label="Quantité" />
              <select value=${r.type_appatage || 'biocide'} onChange=${e => majReleve(po, { type_appatage: e.target.value })} aria-label="Type d'appâtage"><option value="biocide">Biocide</option><option value="non_toxique">Non toxique</option></select>
            </div>
            <div class="x"><input value=${r.commentaire || ''} placeholder="Commentaire (traces, accès…)" onInput=${e => { r.commentaire = e.target.value; setRel(x => ({ ...x })); differe('rc-' + po.id, () => majReleve(po, { commentaire: r.commentaire || null })); }} style="flex:1" />
              <button class="btn sm ghost" onClick=${() => histo(po)}>Historique</button><button class="btn sm ghost" onClick=${() => modifPoste(po)}><${Icon} n="pen" /></button></div>
          </div>`;
        })}
      </div>
    </div></div>`;
}

function FormPlan({ fermer, site, ordre, plan }) {
  const [f, setF] = useState(plan ? { ...plan } : { nom: ordre ? 'Niveau ' + (ordre + 1) : 'Plan principal', type: 'plan_evacuation' });
  const [fichier, setFichier] = useState(null);
  const [att, setAtt] = useState(false);
  const sat = site.latitude ? `https://www.google.com/maps/@${site.latitude},${site.longitude},80m/data=!3m1!1e3` : `https://www.google.com/maps/search/${encodeURIComponent(adresseDe(site))}`;
  const go = async () => {
    setAtt(true);
    try {
      const id = plan?.id || uuid();
      let image_chemin = plan?.image_chemin || null;
      if (fichier) { const b = await reduireImage(fichier, 2200, 0.85); image_chemin = cheminEntreprise('sites', site.id, id + '-' + Date.now() + '.jpg'); await envoyerFichier('plans', image_chemin, b, 'image/jpeg'); }
      const row = { id, site_id: site.id, nom: f.nom || 'Plan', type: f.type, image_chemin, ordre: plan?.ordre ?? ordre, centre_latitude: site.latitude || null, centre_longitude: site.longitude || null };
      const r = plan ? (await modifier('plans', id, row), row) : await ajouter('plans', row);
      fermer(r);
    } catch (e) { erreur(e); setAtt(false); }
  };
  return html`<${Modal} titre="Plan du site" onClose=${() => fermer(null)} pied=${html`<button class="btn ghost" onClick=${() => fermer(null)}>Annuler</button><button class="btn pri" disabled=${att} onClick=${go}>Enregistrer</button>`}>
    <div class="form">
      <${Texte} label="Nom" value=${f.nom} onInput=${v => setF({ ...f, nom: v })} placeholder="Rez-de-chaussée, Sous-sol, Jardin…" />
      <${Choix} label="Type" vide=${false} value=${f.type} onChange=${v => setF({ ...f, type: v })} options=${[['plan_evacuation', "Plan d'évacuation / bâtiment"], ['vue_aerienne', 'Vue satellite (jardin, extérieur)'], ['autre', 'Autre']]} />
    </div>
    ${f.type === 'vue_aerienne' && html`<div class="infobox small">1. Ouvre la <a href=${sat} target="_blank">vue satellite de l'adresse</a>. 2. Fais une capture d'écran. 3. Choisis-la ci-dessous.</div>`}
    <button class="drop" type="button" onClick=${async () => { const [x] = await choisirFichier({ accept: 'image/*' }); if (x) setFichier(x); }}>
      <${Icon} n=${f.type === 'vue_aerienne' ? 'up' : 'cam'} /><b>${fichier ? fichier.name : 'Choisir la photo ou la capture du plan'}</b><span class="small muted">Photo du plan affiché dans le bâtiment, plan papier, capture Maps…</span></button>
  <//>`;
}

function FormPoste({ fermer, po }) {
  const [f, setF] = useState({ ...po });
  const set = k => v => setF(x => ({ ...x, [k]: v }));
  const go = async () => {
    try {
      const ch = { numero: +f.numero || po.numero, nom: f.nom || null, emplacement: f.emplacement || null, categorie: f.categorie, type_poste: f.type_poste || null, fixation: f.fixation || null,
        produit_habituel_id: f.produit_habituel_id || null, date_pose: f.date_pose || null, qr_code: f.qr_code || null };
      await run(sb.from('postes').update(ch).eq('id', po.id)); fermer({ ...po, ...ch });
    } catch (e) { erreur(e); }
  };
  const retirer = async () => {
    if (!(await confirmer(`Retirer le poste ${po.numero} du site ? Son historique est conservé.`, { oui: 'Retirer', danger: true }))) return;
    try { await modifier('postes', po.id, { actif: false, date_retrait: today() }); fermer('retire'); } catch (e) { erreur(e); }
  };
  return html`<${Modal} titre=${'Poste ' + po.numero} onClose=${() => fermer(null)} pied=${html`<button class="btn danger" onClick=${retirer} style="margin-right:auto">Retirer</button><button class="btn ghost" onClick=${() => fermer(null)}>Annuler</button><button class="btn pri" onClick=${go}>Enregistrer</button>`}>
    <div class="form">
      <${Texte} label="Numéro" type="number" value=${f.numero} onInput=${set('numero')} />
      <${Choix} label="Catégorie" vide=${false} value=${f.categorie} onChange=${set('categorie')} options=${Object.entries(CATEGORIES_POSTE)} />
      <${Texte} label="Emplacement" full value=${f.emplacement} onInput=${set('emplacement')} placeholder="ex. local poubelles, derrière la porte" />
      <${TexteListe} label="Type de poste" value=${f.type_poste} onInput=${set('type_poste')} options=${liste('type_poste')} />
      <${TexteListe} label="Fixation" value=${f.fixation} onInput=${set('fixation')} options=${liste('fixation')} />
      <${Choix} label="Appât habituel" value=${f.produit_habituel_id} onChange=${set('produit_habituel_id')} options=${ref.produits.filter(x => x.actif).map(x => [x.id, nomProduit(x)])} />
      <${Texte} label="Date de pose" type="date" value=${f.date_pose} onInput=${set('date_pose')} />
      <${Texte} label="Code QR collé sur le poste" full value=${f.qr_code} onInput=${set('qr_code')} hint="Facultatif" />
    </div><//>`;
}

function Historique({ fermer, po }) {
  const [h, setH] = useState(null);
  useEffect(() => { sb.from('v_historique_postes').select('*').eq('poste_id', po.id).order('date_passage', { ascending: false }).limit(30).then(r => setH(r.data || [])); }, []);
  const E = Object.fromEntries(ETATS_POSTE);
  return html`<${Modal} titre=${`Historique du poste ${po.numero}`} onClose=${() => fermer()}>
    <p class="small muted" style="margin:0">${po.emplacement || ''}</p>
    ${!h ? html`<${Chargement} />` : h.length === 0 ? html`<${Vide}>Aucun relevé.<//>` : html`<table class="tbl"><thead><tr><th>Date</th><th>Conso.</th><th>État</th><th>Appât</th></tr></thead><tbody>
      ${h.map(x => html`<tr><td>${fmtDate(x.date_passage)}</td><td>${x.consommation ? html`<span class=${'pill ' + { TC: 'bad', PC: 'warn', NC: 'ok' }[x.consommation]}>${x.consommation}</span>` : '—'}</td><td>${E[x.etat] || ''}</td><td class="small">${x.appats || ''}</td></tr>`)}</tbody></table>`}<//>`;
}
