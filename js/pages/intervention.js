// Fiche d'intervention (un passage) : infos, constats, produits, postes, photos, délai de rentrée, fin, rapport
import { html, useState, useEffect, useRef, Icon, Presta, Statut, Chargement, Vide, useCharge, Texte, Choix, TexteListe, Champ, Pastilles, Bascule, ouvrir, Modal, erreur, toast, aller, confirmer, choisirFichier, useRefData } from '../ui.js';
import { sb, run, moi, ref, liste, prestation, produit, estAdmin, modifier, ajouter, enregistrer, envoyerFichier, urlFichier, cheminEntreprise, lire, nomTech } from '../db.js';
import { adresseDe, valeursTexte } from '../data.js';
import { fmtDate, fmtTime, fmtDateTime, fmtDuree, telHref, smsHref, mapsHref, position, reduireImage, uuid, STATUTS, MOMENTS, cls, debounce, differe } from '../util.js';
import { FenetrePlanifier } from './planning.js';
import { ChoixNuisibles, produitsPour, nomProduit } from './nouvelle.js';
import { Signature } from './signature.js';
import { OngletPostes } from './postes.js';
import { OngletDelai } from './delai.js';
import { OngletRapport } from './rapport.js';

export async function chargerIntervention(id) {
  return lire('inter-' + id, async () => {
    const p = await run(sb.from('passages').select('*').eq('id', id).single());
    const [dossier, autres, produits, photos] = await Promise.all([
      run(sb.from('dossiers').select('*, dossiers_nuisibles(nuisible_id)').eq('id', p.dossier_id).single()),
      run(sb.from('passages').select('id,numero,nature,statut,debut_prevu,date_cible,depart_le,passage_precedent_id').eq('dossier_id', p.dossier_id).is('supprime_le', null).order('numero')),
      run(sb.from('passages_produits').select('*').eq('passage_id', id).order('cree_le')),
      run(sb.from('photos').select('*').eq('passage_id', id).order('prise_le')),
    ]);
    const ids = [dossier.client_id, dossier.payeur_id].filter(Boolean);
    const [clients, site, apporter] = await Promise.all([
      run(sb.from('clients').select('*').in('id', ids)),
      dossier.site_id ? run(sb.from('sites').select('*').eq('id', dossier.site_id).single()) : null,
      run(sb.from('v_a_apporter').select('*').eq('passage_id', id)),
    ]);
    return { p, dossier, autres, produits, photos, client: clients.find(c => c.id === dossier.client_id), payeur: clients.find(c => c.id === dossier.payeur_id && c.id !== dossier.client_id), site, apporter: apporter[0] };
  });
}

export function Intervention({ id, q }) {
  useRefData();
  const [d, recharger] = useCharge(() => chargerIntervention(id), [id]);
  const [onglet, setOnglet] = useState(q.onglet || 'infos');
  const [p, setP] = useState(null);
  const att = useRef({});
  const envoi = useRef(debounce(async () => {
    const champs = att.current; att.current = {};
    if (!Object.keys(champs).length) return;
    try { await modifier('passages', id, champs); } catch (e) { erreur(e); }
  }, 900));
  useEffect(() => { if (d) setP(d.p); }, [d]);
  useEffect(() => () => envoi.current.flush?.(), []);
  if (!d || !p) return html`<${Chargement} />`;
  const { dossier, client, payeur, site, autres } = d;
  const presta = prestation(dossier.prestation_code);
  const bloque = p.verrouille && !estAdmin();
  const maj = champs => { setP(x => ({ ...x, ...champs })); Object.assign(att.current, champs); envoi.current(); };
  const majTout = async champs => { Object.assign(att.current, champs); const c = att.current; att.current = {}; setP(x => ({ ...x, ...c })); await modifier('passages', id, c); };
  const total = autres.length;
  const onglets = [['infos', 'Infos'], ['constats', 'Constats'], ['produits', 'Produits', d.produits.length],
    ...(presta.a_des_postes || site ? [['postes', 'Postes']] : []), ['photos', 'Photos', d.photos.length],
    ...(p.delai_rentree_requis ? [['delai', 'Délai de rentrée']] : []), ['fin', 'Fin et signature'], ['rapport', 'Rapport']];

  return html`
    <div class="ihead">
      <div><div class="eyebrow"><i>●</i> ${dossier.reference} · passage ${p.numero}/${total}${p.nature ? ' · ' + p.nature : ''}</div>
        <h1 class="ptitle" style="font-size:2.1rem"><a href=${'#/client/' + client.id} style="color:inherit;text-decoration:none">${client.nom_affiche}</a></h1>
        <div class="meta" style="margin-top:10px"><${Presta} code=${dossier.prestation_code} /><${Statut} s=${p.statut} />
          ${p.debut_prevu ? html`<span class="pill">${fmtDateTime(p.debut_prevu)}</span>` : p.date_cible ? html`<span class="pill warn">vers le ${fmtDate(p.date_cible)}</span>` : ''}
          ${payeur && html`<span class="pill">Facturé à ${payeur.nom_affiche}</span>`}
          ${p.verrouille && html`<span class="pill">🔒 Rapport envoyé</span>`}</div></div>
      <${Chrono} p=${p} majTout=${majTout} bloque=${bloque} />
    </div>
    ${bloque && html`<div class="infobox">Ce rapport a été envoyé : seul l'administrateur peut le modifier.</div>`}
    <div class="tabs" role="tablist">${onglets.map(([k, l, n]) => html`<button role="tab" class=${onglet === k ? 'on' : ''} aria-selected=${onglet === k} onClick=${() => setOnglet(k)}>${l}${n ? html`<span class="n">${n}</span>` : ''}</button>`)}</div>
    <fieldset disabled=${bloque} style="border:0;padding:0;margin:0;min-width:0">
      ${onglet === 'infos' && html`<${OngletInfos} d=${d} p=${p} maj=${maj} recharger=${recharger} />`}
      ${onglet === 'constats' && html`<${OngletConstats} d=${d} p=${p} maj=${maj} recharger=${recharger} />`}
      ${onglet === 'produits' && html`<${OngletProduits} d=${d} p=${p} recharger=${recharger} />`}
      ${onglet === 'postes' && html`<${OngletPostes} d=${d} p=${p} recharger=${recharger} />`}
      ${onglet === 'photos' && html`<${OngletPhotos} d=${d} p=${p} recharger=${recharger} />`}
      ${onglet === 'delai' && html`<${OngletDelai} d=${d} p=${p} maj=${maj} majTout=${majTout} />`}
      ${onglet === 'fin' && html`<${OngletFin} d=${d} p=${p} maj=${maj} majTout=${majTout} recharger=${recharger} allerRapport=${() => setOnglet('rapport')} />`}
    </fieldset>
    ${onglet === 'rapport' && html`<${OngletRapport} d=${d} p=${p} majTout=${majTout} recharger=${recharger} />`}`;
}

function Chrono({ p, majTout, bloque }) {
  const [, tic] = useState(0);
  useEffect(() => { if (p.arrivee_le && !p.depart_le) { const t = setInterval(() => tic(x => x + 1), 1000); return () => clearInterval(t); } }, [p.arrivee_le, p.depart_le]);
  if (bloque) return null;
  const arrivee = async () => {
    const pos = await position(6000);
    await majTout({ arrivee_le: new Date().toISOString(), arrivee_latitude: pos?.lat ?? null, arrivee_longitude: pos?.lng ?? null }).catch(erreur);
    toast(pos ? 'Arrivée enregistrée avec ta position' : 'Arrivée enregistrée');
  };
  const depart = () => majTout({ depart_le: new Date().toISOString() }).catch(erreur);
  if (!p.arrivee_le) return html`<div class="chrono"><b>00:00</b><button onClick=${arrivee}><${Icon} n="play" /> Je suis arrivé</button></div>`;
  const fin = p.depart_le ? new Date(p.depart_le) : new Date();
  const s = Math.max(0, Math.floor((fin - new Date(p.arrivee_le)) / 1000));
  const t = `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}${p.depart_le ? '' : ':' + String(s % 60).padStart(2, '0')}`;
  return html`<div class="chrono"><b>${t}</b>${p.depart_le ? html`<span class="small" style="padding-right:14px">${fmtTime(p.arrivee_le)} → ${fmtTime(p.depart_le)}</span>`
    : html`<button onClick=${depart}><${Icon} n="stop" /> Départ</button>`}</div>`;
}

// ---------- Infos ----------
function OngletInfos({ d, p, maj, recharger }) {
  const { dossier, client, payeur, site, autres, apporter } = d;
  const [dos, setDos] = useState(dossier);
  const attDos = useRef({});
  const majDos = ch => { setDos(x => ({ ...x, ...ch })); Object.assign(dossier, ch); Object.assign(attDos.current, ch);
    differe('dos-' + dossier.id, () => { const c = attDos.current; attDos.current = {}; modifier('dossiers', dossier.id, c).catch(erreur); }); };
  const lieu = site || client;
  const adr = adresseDe(lieu);
  const replanifier = async () => { if (await ouvrir(FenetrePlanifier, { p: { ...p, client: client.nom_affiche, prestation: prestation(dossier.prestation_code).nom } })) recharger(); };
  const ajouterPassage = async () => {
    try {
      const n = await run(sb.from('passages').insert({ dossier_id: dossier.id, nature: 'Contrôle', statut: 'a_planifier', technicien_id: p.technicien_id, cree_par: moi.profil?.id }).select().single());
      if (await ouvrir(FenetrePlanifier, { p: { ...n, client: client.nom_affiche } })) toast('Passage ajouté');
      aller('intervention/' + n.id);
    } catch (e) { erreur(e); }
  };
  const gcal = () => {
    if (!p.debut_prevu) return toast("Planifie d'abord le rendez-vous.", true);
    const f = x => new Date(x).toISOString().replace(/[-:]|\.\d{3}/g, '');
    const fin = p.fin_prevue || new Date(new Date(p.debut_prevu).getTime() + 3600000).toISOString();
    window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(prestation(dossier.prestation_code).nom + ' · ' + client.nom_affiche)}&dates=${f(p.debut_prevu)}/${f(fin)}&location=${encodeURIComponent(adr)}&details=${encodeURIComponent('Dossier ' + dossier.reference + (client.telephone ? '\nTél. ' + client.telephone : '') + '\n' + location.href)}`, '_blank');
  };
  const mat = apporter ? [apporter.postes_a_reappater && `${apporter.postes_a_reappater} poste(s) à réappâter (TC ${apporter.postes_tc}, PC ${apporter.postes_pc})`,
    apporter.postes_a_remplacer && `${apporter.postes_a_remplacer} poste(s) à remplacer`, apporter.produit].filter(Boolean) : [];
  const prevus = (p.details?.produits_prevus || []).map(produit).filter(Boolean);
  return html`<div class="grid2" style="margin-top:18px">
    <div class="stack">
      <div class="card"><div class="ch"><h3>Client et lieu</h3>
        <div class="row">${client.telephone && html`<a class="iconbtn" href=${telHref(client.telephone)} aria-label="Appeler"><${Icon} n="phone" /></a><a class="iconbtn" href=${smsHref(client.telephone)} aria-label="SMS"><${Icon} n="sms" /></a>`}
          <a class="iconbtn" href=${mapsHref(adr, lieu?.latitude, lieu?.longitude)} target="_blank" aria-label="Itinéraire"><${Icon} n="pin" /></a></div></div>
        <div class="kv">
          <div><label>Client</label><p><a href=${'#/client/' + client.id}>${client.nom_affiche}</a></p></div>
          <div><label>Téléphone</label><p>${client.telephone || '—'}</p></div>
          <div style="grid-column:1/-1"><label>Adresse</label><p>${site?.nom ? html`<b>${site.nom}</b><br />` : ''}${adr || '—'}</p></div>
          ${site?.acces && html`<div><label>Accès</label><p>${site.acces}</p></div>`}
          ${site?.contact_sur_place && html`<div><label>Contact sur place</label><p>${site.contact_sur_place} ${site.telephone_sur_place || ''}</p></div>`}
          ${payeur && html`<div><label>Facturé à</label><p><a href=${'#/client/' + payeur.id}>${payeur.nom_affiche}</a></p></div>`}
          ${client.remarques && html`<div style="grid-column:1/-1"><label>Remarques</label><p style="white-space:pre-wrap">${client.remarques}</p></div>`}
        </div></div>
      <div class="card"><div class="ch"><h3>Dossier</h3></div><div class="form">
        <${Texte} label="Référence dossier" value=${dos.reference} onInput=${v => majDos({ reference: v })} />
        <${Texte} label="N° ordre de service" value=${dos.ordre_service} onInput=${v => majDos({ ordre_service: v || null })} />
        <${Texte} label="N° devis Abby" value=${dos.devis_abby} onInput=${v => majDos({ devis_abby: v || null })} />
        <${Texte} label="N° facture Abby (ce passage)" value=${p.facture_abby} onInput=${v => maj({ facture_abby: v || null })} hint="Le passage passe en « Facturée »." />
        <${Texte} label="Objet / demande du client" full rows="2" value=${dos.titre} onInput=${v => majDos({ titre: v || null })} />
      </div></div>
    </div>
    <div class="stack">
      <div class="card"><div class="ch"><h3>Rendez-vous</h3><div class="row"><button class="btn sm ghost" onClick=${gcal}>Google Agenda</button><button class="btn sm" onClick=${replanifier}><${Icon} n="cal" />${p.debut_prevu ? 'Déplacer' : 'Planifier'}</button></div></div>
        <div class="kv" style="margin-bottom:14px"><div><label>Date</label><p>${p.debut_prevu ? fmtDateTime(p.debut_prevu) : 'À planifier'}</p></div>
          <div><label>Durée sur place</label><p>${p.duree_minutes != null ? fmtDuree(p.duree_minutes) : '—'}</p></div>
          ${p.confirmation_envoyee_le && html`<div><label>Confirmation</label><p>${p.confirmation_canal === 'sms' ? 'SMS' : 'E-mail'} le ${fmtDate(p.confirmation_envoyee_le)}</p></div>`}
          ${ref.profils.length > 1 && html`<div><label>Technicien</label><p>${nomTech(p.technicien_id)}</p></div>`}</div>
        <div class="form">
          <${TexteListe} label="Nature du passage" value=${p.nature} onInput=${v => maj({ nature: v || null })} options=${liste('nature_passage')} />
          <${Choix} label="Statut" vide=${false} value=${p.statut} onChange=${v => maj({ statut: v })} options=${Object.entries(STATUTS).map(([k, [l]]) => [k, l])} />
          <${Texte} label="Matériel à prévoir" full value=${p.materiel_a_prevoir} onInput=${v => maj({ materiel_a_prevoir: v || null })} />
        </div>
        ${(mat.length > 0 || prevus.length > 0) && html`<div class="band" style="margin-top:14px;padding:12px 16px"><div class="t">À apporter</div><ul>${mat.map(m => html`<li>${m}</li>`)}${prevus.map(x => html`<li>${nomProduit(x)}</li>`)}</ul></div>`}
      </div>
      <div class="card"><div class="ch"><h3>Suivi du dossier</h3><button class="link" onClick=${ajouterPassage}>+ Ajouter un passage</button></div>
        <div class="steps">${autres.map(x => html`<a class=${cls('step', ['fait', 'rapport_envoye', 'facture'].includes(x.statut) ? 'done' : x.id === p.id ? 'now' : '')} href=${'#/intervention/' + x.id} style=${x.id === p.id ? 'font-weight:700' : ''}>
          <i>${x.numero}</i><div><b class="small">${x.nature || 'Passage ' + x.numero}</b><div class="small muted">${x.depart_le || x.debut_prevu ? fmtDate(x.depart_le || x.debut_prevu) : x.date_cible ? 'vers le ' + fmtDate(x.date_cible) : 'à planifier'}</div></div><${Statut} s=${x.statut} /></a>`)}</div></div>
    </div></div>`;
}

// ---------- Constats ----------
function OngletConstats({ d, p, maj, recharger }) {
  const { dossier } = d;
  const presta = prestation(dossier.prestation_code);
  const [nuis, setNuis] = useState((dossier.dossiers_nuisibles || []).map(x => x.nuisible_id));
  const det = p.details || {};
  const setDet = (k, v) => maj({ details: { ...det, [k]: v } });
  const changerNuis = async v => {
    const aj = v.filter(x => !nuis.includes(x)), en = nuis.filter(x => !v.includes(x));
    setNuis(v);
    try {
      if (aj.length) await run(sb.from('dossiers_nuisibles').insert(aj.map(n => ({ dossier_id: dossier.id, nuisible_id: n }))));
      for (const n of en) await run(sb.from('dossiers_nuisibles').delete().eq('dossier_id', dossier.id).eq('nuisible_id', n));
      dossier.dossiers_nuisibles = v.map(n => ({ nuisible_id: n }));
    } catch (e) { erreur(e); }
  };
  return html`<div class="grid2e" style="margin-top:18px">
    <div class="card stack"><h3>Nuisibles</h3>
      <${Champ} label="Nuisible(s) ciblé(s)"><${ChoixNuisibles} presta=${dossier.prestation_code} valeurs=${nuis} onChange=${changerNuis} /><//>
      <${Texte} label="Nuisible constaté sur place" value=${p.nuisible_constate} onInput=${v => maj({ nuisible_constate: v || null })} />
      <${Champ} label="Niveau d'infestation"><${Pastilles} multi=${false} couleur=${presta.couleur} valeurs=${p.niveau_infestation} onChange=${v => maj({ niveau_infestation: v })} options=${liste('niveau_infestation')} /><//>
      <${Texte} label="Zones touchées / traitées" rows="2" value=${p.zones_touchees} onInput=${v => maj({ zones_touchees: v || null })} placeholder="ex. cuisine, cave, local poubelles" />
    </div>
    <div class="card stack"><h3>Constats</h3>
      <${Texte} label="Observations" rows="5" value=${p.constats} onInput=${v => maj({ constats: v || null })} placeholder="Traces, déjections, points d'entrée, hygiène…" />
      ${dossier.prestation_code === 'travaux_hauteur' && html`<div class="form">
        <${Choix} label="Matériel" value=${det.type_nacelle} onChange=${v => setDet('type_nacelle', v)} options=${liste('type_nacelle')} />
        <${Texte} label="Hauteur de travail (m)" type="number" value=${det.hauteur_m} onInput=${v => setDet('hauteur_m', v)} />
        <${Choix} label="Nature des travaux" value=${det.nature_travaux} onChange=${v => setDet('nature_travaux', v)} options=${liste('nature_travaux_hauteur')} />
        <${Texte} label="Quantité réalisée" value=${det.quantite} onInput=${v => setDet('quantite', v)} placeholder="ex. 25 m de pics, 80 m²" />
        <div class="full"><${Bascule} on=${det.balisage} onChange=${v => setDet('balisage', v)} label="Balisage / périmètre de sécurité installé" /></div>
        <div class="full"><${Bascule} on=${det.epi} onChange=${v => setDet('epi', v)} label="Harnais et EPI vérifiés" /></div></div>`}
      ${dossier.prestation_code === 'depigeonnage' && html`<div class="form">
        <${Champ} label="Dispositif(s) posé(s)" full><${Pastilles} couleur=${presta.couleur} valeurs=${det.dispositifs || []} onChange=${v => setDet('dispositifs', v)} options=${liste('dispositif_depigeonnage')} /><//>
        <${Texte} label="Mètres posés" type="number" value=${det.metres_poses} onInput=${v => setDet('metres_poses', v)} />
        <${Texte} label="Zones équipées" value=${det.zones} onInput=${v => setDet('zones', v)} placeholder="rebords, corniches…" /></div>`}
      ${dossier.prestation_code === 'travaux_divers' && html`<div class="form">
        <${Choix} label="Nature des travaux" value=${det.nature_travaux} onChange=${v => setDet('nature_travaux', v)} options=${liste('nature_travaux_divers')} />
        <${Texte} label="Surface / quantité" value=${det.quantite} onInput=${v => setDet('quantite', v)} placeholder="ex. 120 m²" />
        <${Texte} label="Matériel utilisé" full value=${det.materiel} onInput=${v => setDet('materiel', v)} placeholder="nettoyeur haute pression, produit…" /></div>`}
    </div></div>`;
}

// ---------- Produits utilisés ----------
function OngletProduits({ d, p, recharger }) {
  const nuis = (d.dossier.dossiers_nuisibles || []).map(x => x.nuisible_id);
  const proposes = produitsPour(nuis);
  const prevus = p.details?.produits_prevus || [];
  const [lignes, setLignes] = useState(d.produits);
  const ajouterProduit = async pid => {
    const pr = produit(pid); if (!pr) return;
    const row = { passage_id: p.id, produit_id: pid, numero_amm: pr.numero_amm, unite: pr.unite || null, nuisible_id: nuis[0] || null };
    try { const r = await ajouter('passages_produits', row); setLignes(l => [...l, r]); d.produits.push(r); } catch (e) { erreur(e); }
  };
  const majLigne = (l, ch) => { Object.assign(l, ch); setLignes(x => [...x]); differe('pp-' + l.id, () => enregistrer('passages_produits', { ...l }).catch(erreur)); };
  const retirer = async l => {
    if (!(await confirmer(`Retirer ${produit(l.produit_id)?.nom || 'ce produit'} de l'intervention ?`))) return;
    try { await run(sb.from('passages_produits').delete().eq('id', l.id)); setLignes(x => x.filter(y => y !== l)); d.produits.splice(d.produits.indexOf(l), 1); } catch (e) { erreur(e); }
  };
  const autres = ref.produits.filter(x => x.actif && !proposes.includes(x));
  const [choix, setChoix] = useState('');
  return html`<div class="stack" style="margin-top:18px">
    <div class="card"><div class="ch"><h3>Produits utilisés</h3><span class="small muted">Inscrits au registre des biocides avec n° AMM et lot</span></div>
      ${prevus.filter(x => !lignes.some(l => l.produit_id === x)).length > 0 && html`<div class="row" style="margin-bottom:12px"><span class="small muted">Prévus :</span>
        ${prevus.filter(x => !lignes.some(l => l.produit_id === x)).map(x => html`<button class="btn sm" onClick=${() => ajouterProduit(x)}><${Icon} n="plus" />${nomProduit(produit(x))}</button>`)}</div>`}
      ${lignes.length === 0 ? html`<${Vide}>Aucun produit noté pour ce passage.<//>` : lignes.map(l => { const pr = produit(l.produit_id) || {}; return html`
        <div style="padding:12px 0;border-top:1px solid var(--line)" class="stack">
          <div class="row between"><div><b>${nomProduit(pr)}</b> <span class="small muted">${pr.type_biocide || ''}</span></div>
            <div class="row">${(pr.liens?.fds_edialux_url || pr.liens?.fds_url || pr.fds_document_id) && html`<a class="link small" href=${'#/produits?id=' + pr.id}>Fiche produit</a>`}
            <button class="iconbtn" onClick=${() => retirer(l)} aria-label="Retirer"><${Icon} n="trash" /></button></div></div>
          <div class="form" style="grid-template-columns:repeat(3,1fr)">
            <${Texte} label="N° AMM" value=${l.numero_amm} onInput=${v => majLigne(l, { numero_amm: v || null })} />
            <${Texte} label="N° de lot" value=${l.numero_lot} onInput=${v => majLigne(l, { numero_lot: v || null })} />
            <div class="row" style="gap:6px;align-items:flex-end"><div style="flex:1"><${Texte} label="Quantité" type="number" step="any" value=${l.quantite} onInput=${v => majLigne(l, { quantite: v === '' ? null : +v })} /></div>
              <div style="width:80px"><${TexteListe} label="Unité" value=${l.unite} onInput=${v => majLigne(l, { unite: v || null })} options=${['g', 'kg', 'mL', 'L', 'bloc(s)', 'sachet(s)', 'cartouche(s)', 'dose(s)']} /></div></div>
            <${TexteListe} label="Mode d'application" value=${l.methode} onInput=${v => majLigne(l, { methode: v || null })} options=${liste('mode_application')} />
            <div style="grid-column:span 2"><${Texte} label="Zone" value=${l.zone} onInput=${v => majLigne(l, { zone: v || null })} /></div>
          </div></div>`; })}
      <div class="row" style="margin-top:14px">
        <select class="inp" style="max-width:360px" value=${choix} onChange=${e => { setChoix(''); e.target.value && ajouterProduit(e.target.value); }}>
          <option value="">+ Ajouter un produit…</option>
          ${proposes.length > 0 && html`<optgroup label="Proposés pour ces nuisibles">${proposes.map(x => html`<option value=${x.id}>${nomProduit(x)}${x.numero_amm ? ' — ' + x.numero_amm : ''}</option>`)}</optgroup>`}
          <optgroup label=${proposes.length ? 'Autres produits' : 'Mes produits'}>${autres.map(x => html`<option value=${x.id}>${nomProduit(x)}${x.numero_amm ? ' — ' + x.numero_amm : ''}</option>`)}</optgroup>
        </select></div>
    </div></div>`;
}

// ---------- Photos ----------
function OngletPhotos({ d, p, recharger }) {
  const [photos, setPhotos] = useState(d.photos);
  const [moment, setMoment] = useState(prestation(d.dossier.prestation_code).photos_avant_apres ? 'avant' : 'pendant');
  const [urls, setUrls] = useState({});
  const [voir, setVoir] = useState(null);
  useEffect(() => { photos.forEach(ph => !urls[ph.id] && urlFichier('photos', ph.chemin).then(u => setUrls(x => ({ ...x, [ph.id]: u })))); }, [photos]);
  const prendre = async (camera) => {
    const fichiers = await choisirFichier({ accept: 'image/*', multiple: !camera, capture: camera ? 'environment' : undefined });
    if (!fichiers.length) return;
    const pos = await position(4000);
    for (const f of fichiers) {
      try {
        const blob = await reduireImage(f);
        const pid = uuid(), chemin = cheminEntreprise('passages', p.id, pid + '.jpg');
        await envoyerFichier('photos', chemin, blob, 'image/jpeg');
        const row = await ajouter('photos', { id: pid, passage_id: p.id, chemin, moment, prise_le: new Date(f.lastModified || Date.now()).toISOString(), latitude: pos?.lat ?? null, longitude: pos?.lng ?? null, ordre: photos.length, cree_par: moi.profil?.id });
        setUrls(x => ({ ...x, [pid]: URL.createObjectURL(blob) }));
        setPhotos(x => [...x, row]); d.photos.push(row);
      } catch (e) { erreur(e); }
    }
    toast(fichiers.length > 1 ? `${fichiers.length} photos ajoutées` : 'Photo ajoutée');
  };
  const majPhoto = (ph, ch) => { Object.assign(ph, ch); setPhotos(x => [...x]); differe('ph-' + ph.id, () => modifier('photos', ph.id, { legende: ph.legende, moment: ph.moment, dans_rapport: ph.dans_rapport }).catch(erreur)); };
  const groupes = Object.keys(MOMENTS).filter(m => photos.some(ph => ph.moment === m));
  return html`<div class="stack" style="margin-top:18px">
    <div class="card"><div class="ch"><h3>Photos</h3><div class="row"><span class="small muted">Moment :</span><${Pastilles} multi=${false} valeurs=${moment} onChange=${v => v && setMoment(v)} options=${['avant', 'pendant', 'apres'].map(k => [k, MOMENTS[k]])} /></div></div>
      <div class="photos">
        <button class="ph add" onClick=${() => prendre(true)}><span><${Icon} n="cam" /><br />Prendre une photo</span></button>
        <button class="ph add" onClick=${() => prendre(false)}><span><${Icon} n="up" /><br />Depuis la galerie</span></button>
      </div>
      ${groupes.map(g => html`<div style="margin-top:16px"><div class="fl">${MOMENTS[g]}</div><div class="photos">
        ${photos.filter(ph => ph.moment === g).map(ph => html`<button class="ph" onClick=${() => setVoir(ph)}>${urls[ph.id] && html`<img src=${urls[ph.id]} alt=${ph.legende || 'photo'} loading="lazy" />`}
          <span>${fmtDateTime(ph.prise_le)}${ph.legende ? ' · ' + ph.legende : ''}${!ph.dans_rapport ? ' · hors rapport' : ''}</span></button>`)}</div></div>`)}
    </div>
    ${voir && html`<${Modal} titre="Photo" onClose=${() => setVoir(null)} large pied=${html`<button class="btn pri" onClick=${() => setVoir(null)}>Fermer</button>`}>
      ${urls[voir.id] && html`<img src=${urls[voir.id]} style="border-radius:12px;max-height:60vh;object-fit:contain;background:#000" />`}
      <div class="form">
        <${Texte} label="Légende" value=${voir.legende} onInput=${v => majPhoto(voir, { legende: v || null })} placeholder="ex. trou sous la porte du local" />
        <${Choix} label="Moment" vide=${false} value=${voir.moment} onChange=${v => majPhoto(voir, { moment: v })} options=${Object.entries(MOMENTS)} />
      </div>
      <${Bascule} on=${voir.dans_rapport} onChange=${v => majPhoto(voir, { dans_rapport: v })} label="Mettre dans le rapport PDF" />
      ${voir.latitude && html`<a class="small" href=${mapsHref('', voir.latitude, voir.longitude)} target="_blank">Voir l'endroit de la photo sur la carte</a>`}
    <//>`}
  </div>`;
}

// ---------- Fin d'intervention et signatures ----------
function OngletFin({ d, p, maj, majTout, recharger, allerRapport }) {
  const { dossier, client } = d;
  const modelesReco = Object.values(ref.modeles).filter(m => m.code.startsWith('recommandation'));
  const signer = qui => async blob => {
    try {
      const chemin = cheminEntreprise('passages', p.id, `${qui}-${Date.now()}.png`);
      await envoyerFichier('signatures', chemin, blob, 'image/png');
      await majTout(qui === 'client' ? { signature_client_chemin: chemin, signe_le: new Date().toISOString() } : { signature_technicien_chemin: chemin });
      if (qui === 'technicien' && !moi.profil.signature_chemin) { await modifier('profils', moi.profil.id, { signature_chemin: chemin }); moi.profil.signature_chemin = chemin; }
      toast('Signature enregistrée');
    } catch (e) { erreur(e); }
  };
  useEffect(() => { if (!p.signature_technicien_chemin && moi.profil?.signature_chemin && !p.verrouille) majTout({ signature_technicien_chemin: moi.profil.signature_chemin }).catch(() => { }); }, []);
  const terminer = async () => {
    const ch = { statut: p.a_repasser ? 'a_repasser' : 'fait' };
    if (!p.arrivee_le) ch.arrivee_le = p.debut_prevu || new Date().toISOString();
    if (!p.depart_le) ch.depart_le = new Date().toISOString();
    try { await majTout(ch); toast(p.a_repasser ? 'Intervention terminée : un nouveau passage est à planifier' : 'Intervention terminée'); allerRapport(); } catch (e) { erreur(e); }
  };
  const fini = ['fait', 'rapport_envoye', 'facture', 'a_repasser'].includes(p.statut);
  return html`<div class="grid2e" style="margin-top:18px">
    <div class="stack">
      <div class="card stack"><h3>Conclusion</h3>
        <${Champ} label="Recommandations au client">
          <textarea class="inp" rows="4" value=${p.recommandations || ''} onInput=${e => maj({ recommandations: e.target.value || null })} placeholder="ex. Reboucher le passage sous la porte, fermer le local poubelles…"></textarea>
          ${modelesReco.length > 0 && html`<div class="row" style="margin-top:6px">${modelesReco.map(m => html`<button class="btn sm ghost" onClick=${() => maj({ recommandations: [p.recommandations, m.contenu].filter(Boolean).join('\n') })}>+ ${m.titre}</button>`)}</div>`}<//>
        <${Texte} label="Conclusion de l'intervention" rows="3" value=${p.conclusion} onInput=${v => maj({ conclusion: v || null })} placeholder="ex. Traitement réalisé, infestation en régression…" />
        <${Bascule} on=${p.a_repasser} onChange=${v => maj({ a_repasser: v })} label="À repasser" aide="Un nouveau passage sera créé (à planifier) en terminant." />
        <${Texte} label="À prévoir au prochain passage" rows="2" value=${p.a_prevoir_prochain} onInput=${v => maj({ a_prevoir_prochain: v || null })} placeholder="produit, nombre de postes, matériel…" />
        <${Choix} label="Produit à utiliser au prochain passage" value=${p.details?.prochain_produit_id} onChange=${v => maj({ details: { ...p.details, prochain_produit_id: v } })} options=${ref.produits.filter(x => x.actif).map(x => [x.id, nomProduit(x)])} />
        <${Bascule} on=${p.client_absent} onChange=${v => maj({ client_absent: v })} label="Client absent (avis de passage)" aide="Le rapport devient un avis de passage à envoyer au client." />
        ${['desinsectisation', 'desinfection'].includes(dossier.prestation_code) && html`<${Bascule} on=${p.delai_rentree_requis} onChange=${v => maj({ delai_rentree_requis: v })} label="Fiche délai de rentrée" aide="Ajoute l'onglet « Délai de rentrée » à faire signer." />`}
      </div>
    </div>
    <div class="stack">
      ${!p.client_absent && html`<div class="card stack"><h3>Signature du client</h3>
        <div class="form"><${Texte} label="Nom du signataire" value=${p.signataire_nom ?? (client.type === 'particulier' ? client.nom_affiche : client.contact_nom) ?? ''} onInput=${v => maj({ signataire_nom: v })} />
          <${TexteListe} label="Qualité" value=${p.signataire_qualite} onInput=${v => maj({ signataire_qualite: v || null })} options=${['Client', 'Occupant', 'Gardien', 'Gérant', 'Responsable', 'Employé']} /></div>
        <${Signature} chemin=${p.signature_client_chemin} onSigne=${signer('client')} disabled=${p.verrouille && !estAdmin()} />
        ${p.signe_le && html`<p class="small muted" style="margin:0">Signé le ${fmtDateTime(p.signe_le)}</p>`}</div>`}
      <div class="card stack"><h3>Signature du technicien</h3>
        <${Signature} chemin=${p.signature_technicien_chemin} onSigne=${signer('technicien')} label="Ta signature (gardée pour les prochains rapports)" disabled=${p.verrouille && !estAdmin()} /></div>
      <button class="btn pri block" onClick=${terminer}><${Icon} n="check" />${fini ? 'Enregistrer et voir le rapport' : 'Terminer l’intervention'}</button>
    </div></div>`;
}
