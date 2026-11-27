// Contrats à l'année : création des passages, nombre de passages modifiable, renouvellement
import { html, useState, useEffect, Icon, Titre, Statut, Chargement, Vide, useCharge, ouvrir, Texte, Choix, Champ, Pastilles, Bascule, erreur, toast, aller, confirmer, useRefData } from '../ui.js';
import { sb, run, moi, ref, prestation, lire, estAdmin } from '../db.js';
import { adresseDe } from '../data.js';
import { ChoixNuisibles } from './nouvelle.js';
import { FenetrePlanifier } from './planning.js';
import { fmtDate, fmtDateTime, matches, today, CONTRAT_STATUTS, SOUS_TYPES, addDays, dayKey, cls } from '../util.js';

export function Contrats() {
  const [l] = useCharge(() => lire('contrats', () => run(sb.from('contrats').select('*, client:clients!contrats_client_id_fkey(nom_affiche,ville), payeur:clients!contrats_payeur_id_fkey(nom_affiche)').is('supprime_le', null).order('date_debut', { ascending: false }))));
  const [qq, setQ] = useState('');
  const [f, setF] = useState('actif');
  if (!l) return html`<${Chargement} />`;
  const fin30 = dayKey(addDays(new Date(), 45));
  const liste = l.filter(c => (f === 'tous' || c.statut === f || (f === 'bientot' && c.statut === 'actif' && c.date_fin <= fin30)) && matches(qq, c.client?.nom_affiche, c.payeur?.nom_affiche, c.reference, c.client?.ville));
  return html`
    <${Titre} sur=${`${l.filter(c => c.statut === 'actif').length} contrat(s) actif(s)`} em="à l'année" actions=${html`<a class="btn pri" href="#/contrat/nouveau"><${Icon} n="plus" />Nouveau contrat</a>`}>Contrats<//>
    <div class="search"><input class="inp" type="search" placeholder="Client, syndic, référence…" value=${qq} onInput=${e => setQ(e.target.value)} />
      <${Pastilles} multi=${false} valeurs=${f} onChange=${v => setF(v || 'tous')} options=${[['actif', 'Actifs'], ['bientot', 'Finissent bientôt'], ['a_renouveler', 'À renouveler'], ['tous', 'Tous']]} /></div>
    <div class="card" style="padding:8px 12px">${liste.length === 0 ? html`<${Vide}>Aucun contrat.<//>` : html`<div class="tblwrap"><table class="tbl resp">
      <thead><tr><th>Client</th><th class="hm">Prestation</th><th class="hm">Passages</th><th class="hm">Période</th><th>Statut</th></tr></thead><tbody>
      ${liste.map(c => html`<tr class="click" onClick=${() => aller('contrat/' + c.id)}>
        <td><b>${c.client?.nom_affiche}</b><span class="small muted" style="display:block">${[c.payeur && c.payeur.nom_affiche !== c.client?.nom_affiche && 'Facturé à ' + c.payeur.nom_affiche, c.reference].filter(Boolean).join(' · ')}</span></td>
        <td class="hm"><span class="dot" style=${`background:${prestation(c.prestation_code).couleur}`}></span> ${prestation(c.prestation_code).nom}</td>
        <td class="hm">${c.passages_par_an} / an</td><td class="hm small">${fmtDate(c.date_debut)} → ${fmtDate(c.date_fin)}</td>
        <td><span class=${'pill ' + (c.date_fin < today() && c.statut === 'actif' ? 'warn' : CONTRAT_STATUTS[c.statut]?.[1] || '')}>${c.date_fin < today() && c.statut === 'actif' ? 'Échu' : CONTRAT_STATUTS[c.statut]?.[0]}</span></td></tr>`)}
      </tbody></table></div>`}</div>`;
}

function ChoixClient({ value, onChange }) {
  const [cl, setCl] = useState([]);
  const [qq, setQ] = useState('');
  useEffect(() => { sb.from('clients').select('id,nom_affiche,ville,sous_type').is('supprime_le', null).order('nom_affiche').limit(5000).then(r => setCl(r.data || [])); }, []);
  const c = cl.find(x => x.id === value);
  if (c) return html`<div class="selbox"><div><b>${c.nom_affiche}</b><div class="small muted">${c.ville || ''}</div></div><button class="link" onClick=${() => onChange(null)}>Changer</button></div>`;
  const r = qq.length >= 2 ? cl.filter(x => matches(qq, x.nom_affiche, x.ville)).slice(0, 8) : [];
  return html`<div><input class="inp" type="search" placeholder="Rechercher le client (lieu à traiter)…" value=${qq} onInput=${e => setQ(e.target.value)} />
    ${r.length > 0 && html`<div class="sugg">${r.map(x => html`<button onClick=${() => { onChange(x.id); setQ(''); }}><b>${x.nom_affiche}</b> <span class="muted">${[x.ville, x.sous_type && SOUS_TYPES[x.sous_type]].filter(Boolean).join(' · ')}</span></button>`)}</div>`}</div>`;
}

export function FicheContrat({ id, q }) {
  useRefData();
  const nouveau = id === 'nouveau';
  const [d, recharger] = useCharge(async () => {
    if (nouveau) return { c: { client_id: q.client || null, prestation_code: 'deratisation', date_debut: today(), duree_mois: 12, passages_par_an: 4, heure_habituelle: '', duree_passage_min: 60, rappel_passage_jours: 7, rappel_fin_jours: 30, reconduction_tacite: true, statut: 'actif' }, nuis: [], passages: [] };
    const c = await run(sb.from('contrats').select('*').eq('id', id).single());
    const [cn, dos] = await Promise.all([run(sb.from('contrats_nuisibles').select('nuisible_id').eq('contrat_id', id)), run(sb.from('dossiers').select('id,reference').eq('contrat_id', id).is('supprime_le', null))]);
    const passages = dos.length ? await run(sb.from('passages').select('id,numero,nature,statut,date_cible,debut_prevu,fin_prevue,depart_le,dossier_id').in('dossier_id', dos.map(x => x.id)).is('supprime_le', null).order('date_cible')) : [];
    return { c: { ...c, heure_habituelle: c.heure_habituelle?.slice(0, 5) || '' }, nuis: cn.map(x => x.nuisible_id), passages, dos };
  }, [id]);
  const [c, setC] = useState(null);
  const [nuis, setNuis] = useState([]);
  const [sites, setSites] = useState([]);
  const [att, setAtt] = useState(false);
  useEffect(() => { if (d) { setC(d.c); setNuis(d.nuis); } }, [d]);
  useEffect(() => { if (c?.client_id) sb.from('sites').select('*').eq('client_id', c.client_id).is('supprime_le', null).then(r => { setSites(r.data || []); if (!c.site_id && r.data?.[0]) setC(x => ({ ...x, site_id: r.data[0].id })); }); }, [c?.client_id]);
  if (!d || !c) return html`<${Chargement} />`;
  const set = k => v => setC(x => ({ ...x, [k]: v }));
  const go = async () => {
    if (!c.client_id) return toast('Choisis le client.', true);
    setAtt(true);
    try {
      const row = { client_id: c.client_id, site_id: c.site_id || null, prestation_code: c.prestation_code, reference: c.reference || null, date_debut: c.date_debut, duree_mois: +c.duree_mois || 12,
        passages_par_an: Math.min(52, Math.max(1, +c.passages_par_an || 1)), heure_habituelle: c.heure_habituelle || null, duree_passage_min: +c.duree_passage_min || 60,
        prix_annuel_ht: c.prix_annuel_ht === '' || c.prix_annuel_ht == null ? null : +c.prix_annuel_ht, rappel_passage_jours: +c.rappel_passage_jours || 0, rappel_fin_jours: +c.rappel_fin_jours || 0,
        reconduction_tacite: !!c.reconduction_tacite, statut: c.statut, remarques: c.remarques || null };
      if (nouveau) {
        const k = await run(sb.from('contrats').insert({ ...row, cree_par: moi.profil?.id }).select().single());
        if (nuis.length) await run(sb.from('contrats_nuisibles').insert(nuis.map(n => ({ contrat_id: k.id, nuisible_id: n }))));
        const n = await run(sb.rpc('generer_passages_contrat', { p_contrat: k.id }));
        toast(`Contrat créé : ${n} passage(s) ajouté(s) au planning`); aller('contrat/' + k.id);
      } else {
        await run(sb.from('contrats').update(row).eq('id', id));
        const av = d.nuis, aj = nuis.filter(x => !av.includes(x)), en = av.filter(x => !nuis.includes(x));
        if (aj.length) await run(sb.from('contrats_nuisibles').insert(aj.map(n => ({ contrat_id: id, nuisible_id: n }))));
        if (en.length) await run(sb.from('contrats_nuisibles').delete().eq('contrat_id', id).in('nuisible_id', en));
        if (!d.passages.length) await run(sb.rpc('generer_passages_contrat', { p_contrat: id }));
        toast(+row.passages_par_an !== +d.c.passages_par_an ? 'Contrat enregistré : les passages à venir ont été recalculés' : 'Contrat enregistré'); recharger();
      }
    } catch (e) { erreur(e); }
    setAtt(false);
  };
  const supprimerContrat = async () => {
    if (!(await confirmer('Supprimer ce contrat ? Ses passages pas encore faits disparaîtront du planning. Les passages déjà faits et leurs rapports sont gardés.', { titre: 'Supprimer le contrat', oui: 'Supprimer', danger: true }))) return;
    try {
      const t = new Date().toISOString();
      const ds = await run(sb.from('dossiers').select('id').eq('contrat_id', id));
      if (ds.length) await run(sb.from('passages').update({ supprime_le: t }).in('dossier_id', ds.map(x => x.id)).in('statut', ['a_planifier', 'planifie', 'a_repasser']));
      await run(sb.from('contrats').update({ supprime_le: t, statut: 'resilie' }).eq('id', id));
      toast('Contrat supprimé'); aller('contrats');
    } catch (e) { erreur(e); }
  };
  const renouveler = async () => {
    if (!(await confirmer(`Créer le contrat de l'année suivante (à partir du ${fmtDate(addDays(c.date_fin, 1))}) avec les mêmes réglages ?`, { oui: 'Renouveler' }))) return;
    try {
      const { id: _, date_fin, cree_le, modifie_le, entreprise_id, document_id, ...rest } = d.c;
      const k = await run(sb.from('contrats').insert({ ...rest, heure_habituelle: c.heure_habituelle || null, date_debut: dayKey(addDays(d.c.date_fin, 1)), statut: 'actif', cree_par: moi.profil?.id }).select().single());
      if (nuis.length) await run(sb.from('contrats_nuisibles').insert(nuis.map(n => ({ contrat_id: k.id, nuisible_id: n }))));
      await run(sb.rpc('generer_passages_contrat', { p_contrat: k.id }));
      await run(sb.from('contrats').update({ statut: 'termine' }).eq('id', id));
      await run(sb.from('rappels').update({ fait_le: new Date().toISOString() }).eq('contrat_id', id).eq('type', 'contrat_renouveler').is('fait_le', null));
      toast('Contrat renouvelé'); aller('contrat/' + k.id);
    } catch (e) { erreur(e); }
  };
  const planifier = async p => { if (await ouvrir(FenetrePlanifier, { p })) recharger(); };
  const presta = prestation(c.prestation_code);
  return html`
    <${Titre} sur=${nouveau ? 'Nouveau' : 'Contrat ' + (c.reference || '')} em="à l'année">Contrat<//>
    <div class="grid2">
      <div class="stack">
        <div class="card stack"><h3>Client et lieu</h3>
          <${ChoixClient} value=${c.client_id} onChange=${v => setC(x => ({ ...x, client_id: v, site_id: null }))} />
          ${sites.length > 0 && html`<${Choix} label="Lieu" vide=${false} value=${c.site_id} onChange=${set('site_id')} options=${sites.map(s => [s.id, (s.nom ? s.nom + ' — ' : '') + adresseDe(s)])} />`}
          <p class="small muted" style="margin:0">Le syndic ou l'agence rattaché(e) au client est facturé(e) automatiquement.</p></div>
        <div class="card stack"><h3>Prestation</h3>
          <div class="prest">${ref.prestations.map(p => html`<button type="button" style=${`--c:${p.couleur}`} aria-pressed=${c.prestation_code === p.code} onClick=${() => { set('prestation_code')(p.code); setNuis([]); }}><span class="dot" style=${`background:${p.couleur}`}></span>${p.nom}</button>`)}</div>
          <${Champ} label="Nuisible(s)"><${ChoixNuisibles} presta=${c.prestation_code} valeurs=${nuis} onChange=${setNuis} /><//></div>
        <div class="card stack"><h3>Rythme</h3><div class="form">
          <${Texte} label="Début du contrat" type="date" value=${c.date_debut} onInput=${set('date_debut')} />
          <${Texte} label="Durée (mois)" type="number" min="1" value=${c.duree_mois} onInput=${set('duree_mois')} />
          <${Texte} label="Nombre de passages par an" type="number" min="1" max="52" value=${c.passages_par_an} onInput=${set('passages_par_an')} hint=${!nouveau ? 'Si tu le changes, les passages à venir encore vides sont recalculés.' : 'Les passages sont répartis sur l’année.'} />
          <${Texte} label="Heure habituelle (facultatif)" type="time" value=${c.heure_habituelle} onInput=${set('heure_habituelle')} hint="Sans heure : passages « à planifier »" />
          <${Texte} label="Durée d'un passage (min)" type="number" step="15" value=${c.duree_passage_min} onInput=${set('duree_passage_min')} />
          <${Texte} label="Prix annuel HT (info)" type="number" step="0.01" value=${c.prix_annuel_ht} onInput=${set('prix_annuel_ht')} hint="La facture reste dans Abby" />
          <${Texte} label="Rappel avant chaque passage (jours)" type="number" value=${c.rappel_passage_jours} onInput=${set('rappel_passage_jours')} />
          <${Texte} label="Rappel avant la fin (jours)" type="number" value=${c.rappel_fin_jours} onInput=${set('rappel_fin_jours')} />
          <${Texte} label="Référence du contrat" value=${c.reference} onInput=${set('reference')} />
          <${Choix} label="Statut" vide=${false} value=${c.statut} onChange=${set('statut')} options=${Object.entries(CONTRAT_STATUTS).map(([k, [l]]) => [k, l])} />
          <${Texte} label="Remarques" full rows="2" value=${c.remarques} onInput=${set('remarques')} /></div>
          <${Bascule} on=${c.reconduction_tacite} onChange=${set('reconduction_tacite')} label="Reconduction tacite" /></div>
        <div class="row"><button class="btn pri" disabled=${att} onClick=${go}><${Icon} n="check" />${nouveau ? 'Créer le contrat et ses passages' : 'Enregistrer'}</button>
          ${!nouveau && html`<button class="btn ghost" onClick=${renouveler}><${Icon} n="refresh" />Renouveler pour un an</button>`}
          ${!nouveau && c.client_id && html`<a class="btn ghost" href=${'#/client/' + c.client_id}>Fiche client</a>`}
          ${!nouveau && estAdmin() && html`<button class="btn danger" onClick=${supprimerContrat}><${Icon} n="trash" />Supprimer</button>`}</div>
      </div>
      ${!nouveau && html`<div class="card"><div class="ch"><h3>Passages du contrat</h3><span class="pill">${d.passages.length}</span></div>
        ${d.passages.length === 0 ? html`<${Vide}>Les passages seront créés à l'enregistrement.<//>` : html`<div class="steps">${d.passages.map((p, i) => html`<div class=${cls('step', ['fait', 'rapport_envoye', 'facture'].includes(p.statut) ? 'done' : p.statut === 'planifie' ? 'now' : '')}>
          <i>${i + 1}</i><a href=${'#/intervention/' + p.id} style="color:inherit;text-decoration:none"><b class="small">${p.debut_prevu ? fmtDateTime(p.debut_prevu) : 'Vers le ' + fmtDate(p.date_cible)}</b><div class="small muted">${p.nature || ''}</div></a>
          <div class="row" style="gap:6px"><${Statut} s=${p.statut} />${['a_planifier', 'planifie'].includes(p.statut) && html`<button class="btn sm ghost" onClick=${() => planifier({ ...p, client: '', prestation: presta.nom })}>${p.debut_prevu ? 'Déplacer' : 'Planifier'}</button>`}</div></div>`)}</div>`}
      </div>`}
    </div>`;
}
