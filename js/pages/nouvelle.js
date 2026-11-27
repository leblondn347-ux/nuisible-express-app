// Nouvelle intervention (ou intervention en direct, sur place)
import { html, useState, useEffect, Icon, Titre, Chargement, Texte, Choix, TexteListe, Champ, Pastilles, Bascule, erreur, toast, aller, useRefData } from '../ui.js';
import { sb, run, moi, ref, liste, prestation } from '../db.js';
import { creerIntervention, adresseDe } from '../data.js';
import { ChampsClient } from './clients.js';
import { matches, today, position, adresseDepuisPosition, chercherAdresse, debounce, SOUS_TYPES, cls } from '../util.js';

// Produits proposés selon les nuisibles ciblés (y compris sous-catégories et catégorie parente)
export function produitsPour(nuisIds) {
  if (!nuisIds?.length) return [];
  const ids = new Set(nuisIds);
  nuisIds.forEach(id => { const n = ref.nuisibles.find(x => x.id === id); if (n?.parent_id) ids.add(n.parent_id); ref.nuisibles.filter(x => x.parent_id === id).forEach(x => ids.add(x.id)); });
  const prods = new Set(ref.prodNuis.filter(pn => ids.has(pn.nuisible_id)).map(pn => pn.produit_id));
  return ref.produits.filter(p => prods.has(p.id) && p.actif);
}
export const nomProduit = p => p ? (p.nom_usuel || p.nom) : '';

// Choix en cascade : catégories puis sous-catégories de nuisibles
export function ChoixNuisibles({ presta, valeurs, onChange }) {
  const p = prestation(presta);
  const parents = ref.nuisibles.filter(n => n.prestation_code === presta && !n.parent_id);
  if (!parents.length) return html`<p class="small muted">Pas de nuisible à préciser pour cette prestation.</p>`;
  return html`<div class="stack" style="gap:8px">
    <${Pastilles} couleur=${p.couleur} valeurs=${valeurs} onChange=${onChange} options=${parents.map(n => [n.id, n.nom])} />
    ${parents.filter(n => valeurs.includes(n.id)).map(par => {
      const subs = ref.nuisibles.filter(n => n.parent_id === par.id);
      return subs.length > 0 && html`<div class="row small" style="gap:6px"><span class="muted">${par.nom} :</span>
        <${Pastilles} couleur=${p.couleur} valeurs=${valeurs} onChange=${onChange} options=${subs.map(n => [n.id, n.nom])} /></div>`;
    })}</div>`;
}

export function ChoixProduits({ nuisibles, valeurs, onChange }) {
  const [tous, setTous] = useState(false);
  const proposes = produitsPour(nuisibles);
  const listeP = tous || !proposes.length ? ref.produits.filter(p => p.actif) : proposes;
  return html`<div class="stack" style="gap:8px">
    ${!nuisibles.length && !tous ? html`<p class="small muted" style="margin:0">Choisis d'abord le nuisible : les produits adaptés seront proposés.</p>` : html`
    <div class="opts">${listeP.map(p => html`<label class="opt"><input type="checkbox" checked=${valeurs.includes(p.id)} onChange=${() => onChange(valeurs.includes(p.id) ? valeurs.filter(x => x !== p.id) : [...valeurs, p.id])} />
      <span>${nomProduit(p)}${p.numero_amm ? html` <span class="muted small">${p.numero_amm}</span>` : ''}</span></label>`)}</div>`}
    <button type="button" class="link small" style="align-self:flex-start" onClick=${() => setTous(!tous)}>${tous ? 'Voir seulement les produits proposés' : 'Voir tous mes produits'}</button></div>`;
}

export function NouvelleIntervention({ q }) {
  useRefData();
  const direct = q.direct === '1';
  const [clients, setClients] = useState(null);
  const [rq, setRq] = useState('');
  const [client, setClient] = useState(null);
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState(null);
  const [nouveau, setNouveau] = useState(false);
  const [nc, setNc] = useState({ type: 'particulier', canal_confirmation: 'email' });
  const [suggA, setSuggA] = useState([]);
  const [geo, setGeo] = useState(null);
  const [f, setF] = useState({ prestation_code: 'deratisation', nuisibles: [], produits: [], jour: q.jour || today(), heure: '09:00', duree: 60, nature: '', ordre_service: '', devis_abby: '', titre: '', materiel: '', delai: false, details: {} });
  const [att, setAtt] = useState(false);
  const set = k => v => setF(x => ({ ...x, [k]: v }));
  const setN = k => v => setNc(x => ({ ...x, [k]: v }));
  const chercheA = useState(() => debounce(async t => setSuggA(await chercherAdresse(t)), 350))[0];

  useEffect(() => { sb.from('clients').select('id,nom_affiche,ville,telephone,type,sous_type,donneur_ordre_id,adresse,code_postal,latitude,longitude').is('supprime_le', null).order('nom_affiche').limit(5000).then(r => setClients(r.data || [])); }, []);
  useEffect(() => {
    if (!clients || !q.client) return;
    const c = clients.find(x => x.id === q.client); if (c) choisir(c);
  }, [clients]);
  useEffect(() => {
    if (!direct) return;
    setGeo({ att: true });
    position().then(async p => {
      if (!p) return setGeo({ err: 'Position introuvable : autorise la localisation dans le navigateur.' });
      const a = await adresseDepuisPosition(p.lat, p.lng);
      setGeo({ p, a });
      if (a) setNc(x => ({ ...x, adresse: a.adresse, code_postal: a.code_postal, ville: a.ville, latitude: p.lat, longitude: p.lng }));
    });
  }, []);

  async function choisir(c) {
    setClient(c); setNouveau(false); setRq('');
    const { data } = await sb.from('sites').select('*').eq('client_id', c.id).is('supprime_le', null).order('principal', { ascending: false });
    setSites(data || []); setSiteId(data?.[0]?.id || null);
  }
  const proches = (() => {
    if (!geo?.p || !clients) return [];
    const d = c => c.latitude ? Math.hypot(c.latitude - geo.p.lat, (c.longitude - geo.p.lng) * 0.73) : 9;
    return clients.filter(c => d(c) < 0.003).slice(0, 5);
  })();
  const resultats = rq.length >= 2 && clients ? clients.filter(c => matches(rq, c.nom_affiche, c.ville, c.telephone)).slice(0, 8) : [];
  const presta = prestation(f.prestation_code);

  const go = async () => {
    if (!client && !nouveau) return toast('Choisis ou crée un client.', true);
    if (nouveau && !(nc.nom || nc.raison_sociale)) return toast('Indique le nom du nouveau client.', true);
    setAtt(true);
    try {
      let cid = client?.id, sid = siteId;
      if (nouveau) {
        const pro = nc.type === 'professionnel';
        const c = await run(sb.from('clients').insert({ type: nc.type, sous_type: pro ? nc.sous_type || 'societe' : null, nom: nc.nom || null, prenom: nc.prenom || null, raison_sociale: pro ? nc.raison_sociale : null,
          contact_nom: nc.contact_nom || null, telephone: nc.telephone || null, email: nc.email || null, adresse: nc.adresse || null, complement_adresse: nc.complement_adresse || null, code_postal: nc.code_postal || null,
          ville: nc.ville || null, latitude: nc.latitude || null, longitude: nc.longitude || null, remarques: nc.remarques || null, canal_confirmation: nc.canal_confirmation || 'email',
          donneur_ordre_id: nc.donneur_ordre_id || null, cree_par: moi.profil?.id }).select().single());
        cid = c.id;
        if (c.adresse) sid = (await run(sb.from('sites').insert({ client_id: c.id, nom: 'Adresse principale', adresse: c.adresse, complement_adresse: c.complement_adresse, code_postal: c.code_postal, ville: c.ville, latitude: c.latitude, longitude: c.longitude, principal: true }).select().single())).id;
      }
      const { passage } = await creerIntervention({ client_id: cid, site_id: sid, prestation_code: f.prestation_code, nuisibles: f.nuisibles, titre: f.titre, ordre_service: f.ordre_service, devis_abby: f.devis_abby,
        jour: f.jour, heure: f.heure, duree: f.duree, nature: f.nature, produits_prevus: f.produits, materiel_a_prevoir: f.materiel, delai_rentree_requis: f.delai, enDirect: direct, details: f.details, position: geo?.p });
      toast(direct ? 'Intervention démarrée' : 'Intervention créée');
      aller('intervention/' + passage.id);
    } catch (e) { erreur(e); setAtt(false); }
  };

  return html`
    <${Titre} sur=${direct ? 'Sur place, maintenant' : 'Planifier'} em=${direct ? 'en direct' : 'intervention'}>${direct ? 'Intervention' : 'Nouvelle'}<//>
    ${direct && html`<div class="card">${!geo || geo.att ? html`<p class="muted" style="margin:0"><${Icon} n="pin" /> Recherche de ta position…</p>`
      : geo.err ? html`<div class="err">${geo.err}</div>` : html`<div class="row"><${Icon} n="pin" /><div><b>${geo.a?.label || `${geo.p.lat.toFixed(5)}, ${geo.p.lng.toFixed(5)}`}</b><div class="small muted">Position trouvée (précision ${Math.round(geo.p.precision)} m). L'heure d'arrivée est enregistrée au démarrage.</div></div></div>
        ${proches.length > 0 && html`<div style="margin-top:12px"><div class="fl">Clients à proximité</div><div class="chips">${proches.map(c => html`<button aria-pressed=${client?.id === c.id} onClick=${() => choisir(c)}>${c.nom_affiche}</button>`)}</div></div>`}`}</div>`}
    <div class="grid2">
      <div class="stack">
        <div class="card stack"><h3>1 · Client</h3>
          ${client ? html`<div class="selbox"><div><b>${client.nom_affiche}</b><div class="small muted">${[client.ville, client.telephone].filter(Boolean).join(' · ')}</div></div><button class="link" onClick=${() => { setClient(null); setSites([]); }}>Changer</button></div>
            ${sites.length > 1 && html`<${Choix} label="Lieu d'intervention" vide=${false} value=${siteId} onChange=${setSiteId} options=${sites.map(s => [s.id, (s.nom ? s.nom + ' — ' : '') + adresseDe(s)])} />`}
            ${sites.length === 0 && html`<p class="small muted" style="margin:0">Ce client n'a pas encore de lieu enregistré : tu pourras l'ajouter depuis sa fiche.</p>`}`
          : nouveau ? html`<div class="newcl"><div class="row between"><b>Nouveau client</b><button class="link" onClick=${() => setNouveau(false)}>Chercher un client existant</button></div>
              <${ChampsClient} c=${nc} set=${setN} pros=${(clients || []).filter(c => c.type === 'professionnel')} sugg=${suggA} setSugg=${setSuggA} cherche=${chercheA} /></div>`
          : html`<div><input class="inp" type="search" placeholder="Nom, ville ou téléphone du client…" value=${rq} onInput=${e => setRq(e.target.value)} autofocus=${!direct} />
              ${resultats.length > 0 && html`<div class="sugg">${resultats.map(c => html`<button onClick=${() => choisir(c)}><b>${c.nom_affiche}</b> <span class="muted">${[c.ville, c.sous_type && SOUS_TYPES[c.sous_type]].filter(Boolean).join(' · ')}</span></button>`)}</div>`}
              ${rq.length >= 2 && clients && !resultats.length && html`<p class="small muted">Aucun client trouvé.</p>`}</div>
            <button class="btn ghost" onClick=${() => { setNouveau(true); if (rq) setNc(x => ({ ...x, nom: rq })); }}><${Icon} n="plus" />Créer un nouveau client</button>`}
        </div>
        <div class="card stack"><h3>2 · Prestation</h3>
          <div class="prest">${ref.prestations.map(p => html`<button type="button" style=${`--c:${p.couleur}`} aria-pressed=${f.prestation_code === p.code} onClick=${() => setF(x => ({ ...x, prestation_code: p.code, nuisibles: [], produits: [] }))}><span class="dot" style=${`background:${p.couleur}`}></span>${p.nom}</button>`)}</div>
          <${Champ} label="Nuisible(s) ciblé(s)"><${ChoixNuisibles} presta=${f.prestation_code} valeurs=${f.nuisibles} onChange=${set('nuisibles')} /><//>
          ${(presta.a_des_biocides || produitsPour(f.nuisibles).length > 0) && html`<${Champ} label="Produit(s) prévu(s)"><${ChoixProduits} nuisibles=${f.nuisibles} valeurs=${f.produits} onChange=${set('produits')} /><//>`}
          ${f.prestation_code === 'travaux_hauteur' && html`<div class="form">
            <${Choix} label="Matériel" value=${f.details.type_nacelle} onChange=${v => set('details')({ ...f.details, type_nacelle: v })} options=${liste('type_nacelle')} />
            <${Texte} label="Hauteur de travail (m)" type="number" value=${f.details.hauteur_m} onInput=${v => set('details')({ ...f.details, hauteur_m: v })} />
            <${Choix} label="Nature des travaux" full value=${f.details.nature_travaux} onChange=${v => set('details')({ ...f.details, nature_travaux: v })} options=${liste('nature_travaux_hauteur')} /></div>`}
          ${f.prestation_code === 'travaux_divers' && html`<${Choix} label="Nature des travaux" value=${f.details.nature_travaux} onChange=${v => set('details')({ ...f.details, nature_travaux: v })} options=${liste('nature_travaux_divers')} />`}
          ${f.prestation_code === 'depigeonnage' && html`<${Champ} label="Dispositif(s) prévu(s)"><${Pastilles} couleur=${presta.couleur} valeurs=${f.details.dispositifs || []} onChange=${v => set('details')({ ...f.details, dispositifs: v })} options=${liste('dispositif_depigeonnage')} /><//>`}
          ${['desinsectisation', 'desinfection'].includes(f.prestation_code) && html`<${Bascule} on=${f.delai} onChange=${set('delai')} label="Fiche délai de rentrée à faire signer" aide="Pulvérisation ou nébulisation : le client signe les consignes de sécurité." />`}
        </div>
      </div>
      <div class="stack">
        <div class="card stack"><h3>3 · ${direct ? 'Détails' : 'Rendez-vous'}</h3>
          <div class="form">
            ${!direct && html`<${Texte} label="Jour" type="date" value=${f.jour} onInput=${set('jour')} /><${Texte} label="Heure" type="time" value=${f.heure} onInput=${set('heure')} />
              <${Texte} label="Durée (minutes)" type="number" min="15" step="15" value=${f.duree} onInput=${v => set('duree')(+v || 60)} />`}
            <${TexteListe} label="Nature du passage" value=${f.nature} onInput=${set('nature')} options=${liste('nature_passage')} placeholder="Pose, contrôle, curatif…" />
            <${Texte} label="N° ordre de service" value=${f.ordre_service} onInput=${set('ordre_service')} hint="Donné par le syndic ou l'assureur" />
            <${Texte} label="N° devis Abby" value=${f.devis_abby} onInput=${set('devis_abby')} />
            <${Texte} label="Objet / demande du client" full rows="2" value=${f.titre} onInput=${set('titre')} />
            <${Texte} label="Matériel à prévoir" full value=${f.materiel} onInput=${set('materiel')} placeholder="ex. échelle, 10 boîtes, gel…" />
          </div>
          ${!direct && html`<p class="small muted" style="margin:0">C'est un contrat à l'année ? <a href=${'#/contrat/nouveau' + (client ? '?client=' + client.id : '')}>Crée plutôt un contrat</a> : les passages de l'année se créeront tout seuls.</p>`}
        </div>
        <button class="btn pri block" disabled=${att} onClick=${go}><${Icon} n=${direct ? 'play' : 'check'} />${att ? 'Enregistrement…' : direct ? 'Démarrer l’intervention' : 'Créer l’intervention'}</button>
      </div>
    </div>`;
}
