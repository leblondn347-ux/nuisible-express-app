// Clients : liste, fiche, lieux, clients rattachés, import des contacts
import { html, useState, useEffect, Icon, Titre, Presta, Statut, Chargement, Vide, useCharge, Modal, ouvrir, Texte, Choix, Champ, Pastilles, erreur, toast, aller, confirmer, choisirFichier } from '../ui.js';
import { sb, run, moi, ref, lire, estAdmin, corbeille, prestation } from '../db.js';
import { adresseDe, nomClient } from '../data.js';
import { matches, fmtDate, telHref, smsHref, mailHref, mapsHref, chercherAdresse, SOUS_TYPES, CONTRAT_STATUTS, debounce, telecharger, cls } from '../util.js';
import { ListeDocuments } from './documents.js';

export async function tousClients() {
  return lire('clients', () => run(sb.from('clients').select('*').is('supprime_le', null).order('nom_affiche').limit(5000)));
}

export function Clients() {
  const [qq, setQ] = useState('');
  const [f, setF] = useState('tous');
  const [cl, recharger] = useCharge(tousClients);
  if (!cl) return html`<${Chargement} />`;
  const donneurs = Object.fromEntries(cl.map(c => [c.id, c]));
  const nbRatt = id => cl.filter(c => c.donneur_ordre_id === id).length;
  const liste = cl.filter(c => (f === 'tous' || (f === 'par' && c.type === 'particulier') || (f === 'pro' && c.type === 'professionnel') ||
    (f === 'syn' && ['syndic', 'agence_immobiliere'].includes(c.sous_type))) && matches(qq, c.nom_affiche, c.ville, c.telephone, c.email, c.contact_nom, donneurs[c.donneur_ordre_id]?.nom_affiche));
  const nouveau = async () => { const c = await ouvrir(FormClient, {}); if (c) aller('client/' + c.id); };
  const importer = async () => { const n = await ouvrir(ImportContacts, {}); if (n) recharger(); };
  return html`
    <${Titre} sur=${`${cl.length} client(s)`} em="clients" actions=${html`<button class="btn ghost" onClick=${importer}><${Icon} n="up" />Importer des contacts</button><button class="btn pri" onClick=${nouveau}><${Icon} n="plus" />Nouveau client</button>`}>Mes<//>
    <div class="search"><input class="inp" type="search" placeholder="Rechercher un nom, une ville, un téléphone…" value=${qq} onInput=${e => setQ(e.target.value)} />
      <${Pastilles} multi=${false} valeurs=${f} onChange=${v => setF(v || 'tous')} options=${[['tous', 'Tous'], ['par', 'Particuliers'], ['pro', 'Professionnels'], ['syn', 'Syndics et agences']]} /></div>
    <div class="card" style="padding:8px 12px">
      ${liste.length === 0 ? html`<${Vide}>${cl.length ? 'Aucun client ne correspond.' : 'Aucun client pour l’instant. Crée le premier ou importe tes contacts.'}<//>` : html`
      <div class="tblwrap"><table class="tbl resp"><thead><tr><th>Client</th><th class="hm">Ville</th><th class="hm">Téléphone</th><th class="hm">Rattaché à</th></tr></thead><tbody>
      ${liste.slice(0, 300).map(c => html`<tr class="click" onClick=${() => aller('client/' + c.id)}>
        <td><div class="cname"><span class=${cls('ctype', c.type === 'professionnel' ? 'pro' : 'par')}>${c.type === 'professionnel' ? 'PRO' : 'PAR'}</span>
          <div><b>${c.nom_affiche}</b><span class="small muted">${c.sous_type ? SOUS_TYPES[c.sous_type] : c.type === 'particulier' ? 'Particulier' : 'Professionnel'}${nbRatt(c.id) ? ` · ${nbRatt(c.id)} client(s) rattaché(s)` : ''}</span></div></div></td>
        <td class="hm">${c.ville || ''}</td><td class="hm num">${c.telephone || ''}</td><td class="hm">${donneurs[c.donneur_ordre_id]?.nom_affiche || ''}</td>
        <td style="display:none"></td></tr>`)}</tbody></table></div>
      ${liste.length > 300 && html`<p class="small muted">300 premiers résultats affichés : précise ta recherche.</p>`}`}
    </div>`;
}

// ---------- Formulaire client ----------
export function FormClient({ fermer, client, donneur_ordre_id, adresseInitiale }) {
  const [c, setC] = useState(() => client ? { ...client } : { type: 'particulier', canal_confirmation: 'email', donneur_ordre_id: donneur_ordre_id || null, ...(adresseInitiale || {}) });
  const [pros, setPros] = useState([]);
  const [sugg, setSugg] = useState([]);
  const [att, setAtt] = useState(false);
  useEffect(() => { sb.from('clients').select('id,nom_affiche,sous_type').eq('type', 'professionnel').is('supprime_le', null).order('nom_affiche').then(r => setPros(r.data || [])); }, []);
  const set = k => v => setC(x => ({ ...x, [k]: v }));
  const cherche = useState(() => debounce(async q => setSugg(await chercherAdresse(q)), 350))[0];
  const pro = c.type === 'professionnel';
  const go = async () => {
    if (!(c.raison_sociale || c.nom)) return toast(pro ? 'Indique la raison sociale.' : 'Indique le nom.', true);
    setAtt(true);
    try {
      const row = { type: c.type, sous_type: pro ? (c.sous_type || 'societe') : null, donneur_ordre_id: c.donneur_ordre_id || null, civilite: c.civilite || null,
        nom: c.nom || null, prenom: c.prenom || null, raison_sociale: pro ? (c.raison_sociale || null) : null, siret: c.siret || null, contact_nom: c.contact_nom || null,
        telephone: c.telephone || null, telephone_2: c.telephone_2 || null, email: (c.email || '').trim() || null,
        emails_copie: (typeof c.emails_copie === 'string' ? c.emails_copie.split(/[,; ]+/) : c.emails_copie || []).filter(Boolean),
        adresse: c.adresse || null, complement_adresse: c.complement_adresse || null, code_postal: c.code_postal || null, ville: c.ville || null,
        latitude: c.latitude || null, longitude: c.longitude || null, remarques: c.remarques || null, canal_confirmation: c.canal_confirmation || 'email' };
      let res;
      if (client) res = await run(sb.from('clients').update(row).eq('id', client.id).select().single());
      else {
        res = await run(sb.from('clients').insert({ ...row, cree_par: moi.profil?.id }).select().single());
        if (row.adresse) await run(sb.from('sites').insert({ client_id: res.id, nom: 'Adresse principale', adresse: row.adresse, complement_adresse: row.complement_adresse, code_postal: row.code_postal, ville: row.ville, latitude: row.latitude, longitude: row.longitude, principal: true }));
      }
      toast(client ? 'Client modifié' : 'Client créé'); fermer(res);
    } catch (e) { erreur(e); setAtt(false); }
  };
  return html`<${Modal} titre=${client ? 'Modifier le client' : 'Nouveau client'} onClose=${() => fermer(null)} large pied=${html`
    <button class="btn ghost" onClick=${() => fermer(null)}>Annuler</button><button class="btn pri" disabled=${att} onClick=${go}>${client ? 'Enregistrer' : 'Créer le client'}</button>`}>
    <${ChampsClient} c=${c} set=${set} pros=${pros} sugg=${sugg} setSugg=${setSugg} cherche=${cherche} />
  <//>`;
}

export function ChampsClient({ c, set, pros, sugg, setSugg, cherche }) {
  const pro = c.type === 'professionnel';
  const choisirAdr = a => { set('adresse')(a.adresse); set('code_postal')(a.code_postal); set('ville')(a.ville); set('latitude')(a.lat); set('longitude')(a.lng); setSugg([]); };
  return html`<div class="form">
    <${Champ} label="Type de client" full><${Pastilles} multi=${false} valeurs=${c.type} onChange=${v => v && set('type')(v)} options=${[['particulier', 'Particulier'], ['professionnel', 'Professionnel']]} /><//>
    ${pro ? html`
      <${Texte} label="Raison sociale *" value=${c.raison_sociale} onInput=${set('raison_sociale')} />
      <${Choix} label="Catégorie" value=${c.sous_type || 'societe'} vide=${false} onChange=${set('sous_type')} options=${Object.entries(SOUS_TYPES)} hint="Syndic ou agence : tu pourras y rattacher des clients (copropriétés, occupants)." />
      <${Texte} label="Contact / gestionnaire" value=${c.contact_nom} onInput=${set('contact_nom')} />
      <${Texte} label="SIRET" value=${c.siret} onInput=${set('siret')} />`
    : html`
      <${Texte} label="Nom *" value=${c.nom} onInput=${set('nom')} />
      <${Texte} label="Prénom" value=${c.prenom} onInput=${set('prenom')} />`}
    <${Choix} label="Rattaché à (syndic, agence… qui est facturé)" full value=${c.donneur_ordre_id} onChange=${set('donneur_ordre_id')} vide="Aucun (le client paie lui-même)"
      options=${(pros || []).filter(p => p.id !== c.id).map(p => [p.id, p.nom_affiche + (p.sous_type ? ' · ' + SOUS_TYPES[p.sous_type] : '')])} />
    <${Texte} label="Téléphone" type="tel" value=${c.telephone} onInput=${set('telephone')} />
    <${Texte} label="Autre téléphone" type="tel" value=${c.telephone_2} onInput=${set('telephone_2')} />
    <${Texte} label="E-mail" type="email" value=${c.email} onInput=${set('email')} />
    <${Texte} label="Autres e-mails pour les rapports" value=${Array.isArray(c.emails_copie) ? c.emails_copie.join(', ') : c.emails_copie} onInput=${set('emails_copie')} placeholder="séparés par une virgule" />
    <${Champ} label="Adresse" full>
      <input class="inp" value=${c.adresse || ''} autocomplete="off" placeholder="Commence à taper l'adresse…" onInput=${e => { set('adresse')(e.target.value); cherche(e.target.value + ' ' + (c.ville || '')); }} />
      ${sugg.length > 0 && html`<div class="sugg">${sugg.map(a => html`<button type="button" onClick=${() => choisirAdr(a)}>${a.label}</button>`)}</div>`}<//>
    <${Texte} label="Complément (bâtiment, étage…)" value=${c.complement_adresse} onInput=${set('complement_adresse')} />
    <div class="form" style="gap:12px"><${Texte} label="Code postal" value=${c.code_postal} onInput=${set('code_postal')} inputmode="numeric" /><${Texte} label="Ville" value=${c.ville} onInput=${set('ville')} /></div>
    <${Texte} label="Remarques (code portail, chien, accès…)" full rows="2" value=${c.remarques} onInput=${set('remarques')} />
    <${Champ} label="Confirmation du rendez-vous la veille" full><${Pastilles} multi=${false} valeurs=${c.canal_confirmation} onChange=${v => v && set('canal_confirmation')(v)} options=${[['email', 'Par e-mail'], ['sms', 'Par SMS']]} /><//>
  </div>`;
}

// ---------- Lieux d'intervention ----------
export function FormSite({ fermer, site, client }) {
  const [s, setS] = useState(site ? { ...site } : { client_id: client.id });
  const [sugg, setSugg] = useState([]);
  const cherche = useState(() => debounce(async q => setSugg(await chercherAdresse(q)), 350))[0];
  const set = k => v => setS(x => ({ ...x, [k]: v }));
  const go = async () => {
    if (!s.adresse) return toast("Indique l'adresse.", true);
    try {
      const row = { client_id: s.client_id, nom: s.nom || null, adresse: s.adresse, complement_adresse: s.complement_adresse || null, code_postal: s.code_postal || null, ville: s.ville || null,
        latitude: s.latitude || null, longitude: s.longitude || null, contact_sur_place: s.contact_sur_place || null, telephone_sur_place: s.telephone_sur_place || null, acces: s.acces || null, remarques: s.remarques || null };
      const r = site ? await run(sb.from('sites').update(row).eq('id', site.id).select().single()) : await run(sb.from('sites').insert(row).select().single());
      toast('Lieu enregistré'); fermer(r);
    } catch (e) { erreur(e); }
  };
  const supprSite = async () => {
    if (!(await confirmer(`Supprimer le lieu « ${site.nom || site.adresse} » ? Les interventions déjà faites restent dans l'historique.`, { titre: 'Supprimer le lieu', oui: 'Supprimer', danger: true }))) return;
    try { await run(sb.from('sites').update({ supprime_le: new Date().toISOString() }).eq('id', site.id)); toast('Lieu supprimé'); fermer(true); } catch (e) { erreur(e); }
  };
  return html`<${Modal} titre=${site ? 'Modifier le lieu' : 'Nouveau lieu d’intervention'} onClose=${() => fermer(null)} pied=${html`${site && estAdmin() && html`<button class="btn danger" style="margin-right:auto" onClick=${supprSite}>Supprimer</button>`}<button class="btn ghost" onClick=${() => fermer(null)}>Annuler</button><button class="btn pri" onClick=${go}>Enregistrer</button>`}>
    <div class="form">
      <${Texte} label="Nom du lieu" full value=${s.nom} onInput=${set('nom')} placeholder="ex. Résidence Les Pins, bât. B" />
      <${Champ} label="Adresse *" full><input class="inp" value=${s.adresse || ''} autocomplete="off" onInput=${e => { set('adresse')(e.target.value); cherche(e.target.value); }} />
        ${sugg.length > 0 && html`<div class="sugg">${sugg.map(a => html`<button type="button" onClick=${() => { setS(x => ({ ...x, adresse: a.adresse, code_postal: a.code_postal, ville: a.ville, latitude: a.lat, longitude: a.lng })); setSugg([]); }}>${a.label}</button>`)}</div>`}<//>
      <${Texte} label="Code postal" value=${s.code_postal} onInput=${set('code_postal')} /><${Texte} label="Ville" value=${s.ville} onInput=${set('ville')} />
      <${Texte} label="Complément" value=${s.complement_adresse} onInput=${set('complement_adresse')} /><${Texte} label="Accès (code, clé, gardien)" value=${s.acces} onInput=${set('acces')} />
      <${Texte} label="Contact sur place" value=${s.contact_sur_place} onInput=${set('contact_sur_place')} /><${Texte} label="Téléphone sur place" type="tel" value=${s.telephone_sur_place} onInput=${set('telephone_sur_place')} />
      <${Texte} label="Remarques" full rows="2" value=${s.remarques} onInput=${set('remarques')} />
    </div><//>`;
}

// ---------- Fiche client ----------
export function FicheClient({ id }) {
  const [d, recharger] = useCharge(() => lire('client-' + id, async () => {
    const [c, sites, ratt, contrats, dossiers] = await Promise.all([
      run(sb.from('clients').select('*').eq('id', id).single()),
      run(sb.from('sites').select('*').eq('client_id', id).is('supprime_le', null).order('principal', { ascending: false })),
      run(sb.from('clients').select('id,nom_affiche,ville,telephone,type').eq('donneur_ordre_id', id).is('supprime_le', null).order('nom_affiche')),
      run(sb.from('contrats').select('*').or(`client_id.eq.${id},payeur_id.eq.${id}`).is('supprime_le', null).order('date_debut', { ascending: false })),
      run(sb.from('dossiers').select('*, passages(id,numero,nature,statut,debut_prevu,date_cible,depart_le,supprime_le), client:clients!dossiers_client_id_fkey(nom_affiche)').or(`client_id.eq.${id},payeur_id.eq.${id}`).is('supprime_le', null).order('cree_le', { ascending: false })),
    ]);
    const donneur = c.donneur_ordre_id ? await run(sb.from('clients').select('id,nom_affiche,email').eq('id', c.donneur_ordre_id).single()) : null;
    return { c, sites, ratt, contrats, dossiers, donneur };
  }), [id]);
  if (!d) return html`<${Chargement} />`;
  const { c, sites, ratt, contrats, dossiers, donneur } = d;
  const pro = c.type === 'professionnel', grp = ['syndic', 'agence_immobiliere'].includes(c.sous_type);
  const modif = async () => { if (await ouvrir(FormClient, { client: c })) recharger(); };
  const nouveauSite = async s => { if (await ouvrir(FormSite, { site: s, client: c })) recharger(); };
  const nouveauRatt = async () => { const r = await ouvrir(FormClient, { donneur_ordre_id: c.id }); if (r) recharger(); };
  const suppr = async () => { if (await confirmer(`Supprimer le client « ${c.nom_affiche} » ? Ses interventions disparaîtront aussi du planning.`, { danger: true, oui: 'Supprimer' })) {
    try {
      const t = new Date().toISOString(), ids = dossiers.filter(x => x.client_id === c.id).map(x => x.id);
      if (ids.length) { await run(sb.from('passages').update({ supprime_le: t }).in('dossier_id', ids)); await run(sb.from('dossiers').update({ supprime_le: t }).in('id', ids)); }
      await run(sb.from('clients').update({ supprime_le: t }).eq('id', c.id)); aller('clients');
    } catch (e) { erreur(e); } } };
  const vcard = () => telecharger(new Blob([`BEGIN:VCARD\r\nVERSION:3.0\r\nFN:${c.nom_affiche}\r\n${c.prenom || c.nom ? `N:${c.nom || ''};${c.prenom || ''};;;\r\n` : ''}${pro ? `ORG:${c.raison_sociale}\r\n` : ''}${c.telephone ? `TEL;TYPE=CELL:${c.telephone}\r\n` : ''}${c.email ? `EMAIL:${c.email}\r\n` : ''}${c.adresse ? `ADR;TYPE=WORK:;;${c.adresse};${c.ville || ''};;${c.code_postal || ''};France\r\n` : ''}NOTE:Client Nuisible Express 34\r\nEND:VCARD\r\n`], { type: 'text/vcard' }), (c.nom_affiche || 'contact') + '.vcf');
  return html`
    <div class="head"><div><div class="eyebrow">${pro ? (SOUS_TYPES[c.sous_type] || 'Professionnel') : 'Particulier'}${donneur ? html` · rattaché à <a href=${'#/client/' + donneur.id}>${donneur.nom_affiche}</a>` : ''}</div>
      <h1 class="ptitle">${c.nom_affiche}</h1></div>
      <div class="acts">
        ${c.telephone && html`<a class="iconbtn" href=${telHref(c.telephone)} aria-label="Appeler"><${Icon} n="phone" /></a><a class="iconbtn" href=${smsHref(c.telephone)} aria-label="SMS"><${Icon} n="sms" /></a>`}
        ${c.email && html`<a class="iconbtn" href=${mailHref(c.email)} aria-label="E-mail"><${Icon} n="mail" /></a>`}
        ${c.adresse && html`<a class="iconbtn" href=${mapsHref(adresseDe(c), c.latitude, c.longitude)} target="_blank" aria-label="Itinéraire"><${Icon} n="pin" /></a>`}
        <button class="btn ghost sm" onClick=${modif}><${Icon} n="pen" />Modifier</button>
        <a class="btn pri sm" href=${'#/nouvelle?client=' + c.id}><${Icon} n="plus" />Intervention</a>
      </div></div>
    <div class="grid2">
      <div class="stack">
        <div class="card"><div class="ch"><h3>Suivi des interventions</h3><span class="pill">${dossiers.length} dossier(s)</span></div>
          ${dossiers.length === 0 ? html`<${Vide}>Aucune intervention pour ce client.<//>` : dossiers.map(dos => {
            const ps = (dos.passages || []).filter(p => !p.supprime_le).sort((a, b) => a.numero - b.numero);
            return html`<div style="padding:12px 0;border-top:1px solid var(--line)">
              <div class="row between"><div><${Presta} code=${dos.prestation_code} court /> <b>${dos.reference}</b>${dos.ordre_service ? html` <span class="small muted">OS ${dos.ordre_service}</span>` : ''}
                ${dos.client_id !== c.id && html` <span class="small muted">· ${dos.client?.nom_affiche}</span>`}</div>
                <span class="small muted">${dos.facture_abby ? 'Facture ' + dos.facture_abby : dos.devis_abby ? 'Devis ' + dos.devis_abby : ''}</span></div>
              ${dos.titre && html`<div class="small" style="margin-top:4px">${dos.titre}</div>`}
              <div class="steps" style="margin-top:6px">${ps.map(p => html`<a class=${cls('step', ['fait', 'rapport_envoye', 'facture'].includes(p.statut) ? 'done' : p.statut === 'planifie' ? 'now' : '')} href=${'#/intervention/' + p.id}>
                <i>${p.numero}</i><div><b class="small">${p.nature || 'Passage ' + p.numero}</b><div class="small muted">${p.depart_le || p.debut_prevu ? fmtDate(p.depart_le || p.debut_prevu) : p.date_cible ? 'vers le ' + fmtDate(p.date_cible) : 'à planifier'}</div></div><${Statut} s=${p.statut} /></a>`)}</div>
            </div>`;
          })}
        </div>
        <div class="card"><div class="ch"><h3>Documents et rapports</h3></div><${ListeDocuments} filtre=${{ client_id: c.id }} rattachement=${{ client_id: c.id }} /></div>
      </div>
      <div class="stack">
        <div class="card"><div class="ch"><h3>Coordonnées</h3></div><div class="kv">
          ${c.contact_nom && html`<div><label>Contact</label><p>${c.contact_nom}</p></div>`}
          <div><label>Téléphone</label><p>${c.telephone ? html`<a href=${telHref(c.telephone)}>${c.telephone}</a>` : '—'}${c.telephone_2 ? html`<br />${c.telephone_2}` : ''}</p></div>
          <div><label>E-mail</label><p>${c.email || '—'}</p></div>
          <div style="grid-column:1/-1"><label>Adresse</label><p>${adresseDe(c) || '—'}</p></div>
          ${c.emails_copie?.length > 0 && html`<div style="grid-column:1/-1"><label>Copie des rapports</label><p>${c.emails_copie.join(', ')}</p></div>`}
          <div><label>Confirmation RDV</label><p>${c.canal_confirmation === 'sms' ? 'SMS' : 'E-mail'}</p></div>
          ${c.siret && html`<div><label>SIRET</label><p>${c.siret}</p></div>`}
          ${c.remarques && html`<div style="grid-column:1/-1"><label>Remarques</label><p style="white-space:pre-wrap">${c.remarques}</p></div>`}
        </div>
        <div class="row" style="margin-top:14px"><button class="btn sm ghost" onClick=${vcard}><${Icon} n="dl" />Ajouter à mes contacts</button>
          ${estAdmin() && html`<button class="btn sm danger" onClick=${suppr}><${Icon} n="trash" />Supprimer</button>`}</div></div>
        <div class="card"><div class="ch"><h3>Lieux d'intervention</h3><button class="link" onClick=${() => nouveauSite()}>+ Ajouter</button></div>
          ${sites.length === 0 ? html`<${Vide}>Aucun lieu enregistré.<//>` : sites.map(s => html`<div class="lieu"><div><b>${s.nom || 'Lieu'}</b><div class="small muted">${adresseDe(s)}</div>${s.acces && html`<div class="small">Accès : ${s.acces}</div>`}</div>
            <div class="row"><a class="iconbtn" href=${mapsHref(adresseDe(s), s.latitude, s.longitude)} target="_blank" aria-label="Itinéraire"><${Icon} n="pin" /></a><button class="iconbtn" onClick=${() => nouveauSite(s)} aria-label="Modifier"><${Icon} n="pen" /></button></div></div>`)}
        </div>
        ${(grp || ratt.length > 0) && html`<div class="card"><div class="ch"><h3>Clients rattachés</h3><button class="link" onClick=${nouveauRatt}>+ Ajouter</button></div>
          ${ratt.length === 0 ? html`<${Vide}>Ajoute ici les copropriétés ou occupants gérés par ${c.nom_affiche}.<//>` : ratt.map(r => html`<a class="lieu" href=${'#/client/' + r.id}><div><b>${r.nom_affiche}</b><div class="small muted">${r.ville || ''} ${r.telephone || ''}</div></div><${Icon} n="next" /></a>`)}
        </div>`}
        <div class="card"><div class="ch"><h3>Contrats</h3><a class="link" href=${'#/contrat/nouveau?client=' + c.id}>+ Nouveau contrat</a></div>
          ${contrats.length === 0 ? html`<${Vide}>Aucun contrat.<//>` : contrats.map(k => html`<a class="lieu" href=${'#/contrat/' + k.id}><div><b>${prestation(k.prestation_code).nom}</b> · ${k.passages_par_an} passage(s)/an
            <div class="small muted">du ${fmtDate(k.date_debut)} au ${fmtDate(k.date_fin)}${k.reference ? ' · ' + k.reference : ''}</div></div><span class=${'pill ' + (CONTRAT_STATUTS[k.statut]?.[1] || '')}>${CONTRAT_STATUTS[k.statut]?.[0]}</span></a>`)}
        </div>
      </div>
    </div>`;
}

// ---------- Import des contacts (téléphone Android, fichier Google Contacts ou vCard) ----------
function lireVcf(t) {
  return t.split(/BEGIN:VCARD/i).slice(1).map(b => {
    const l = k => (b.match(new RegExp('^' + k + '[^:\\n]*:(.*)$', 'im')) || [])[1]?.trim();
    const n = (l('N') || '').split(';'), adr = (l('ADR') || '').split(';');
    return { nom: n[0] || l('FN'), prenom: n[1], raison_sociale: l('ORG')?.replace(/;+$/, ''), telephone: l('TEL'), email: l('EMAIL'), adresse: adr[2], ville: adr[3], code_postal: adr[5] };
  });
}
function lireCsv(t) {
  const lignes = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',' || ch === ';') { row.push(cur); cur = ''; } else if (ch === '\n') { row.push(cur.replace(/\r$/, '')); lignes.push(row); row = []; cur = ''; } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); lignes.push(row); }
  const [en, ...rs] = lignes; const i = re => en.findIndex(h => re.test(h));
  const ix = { prenom: i(/^(First Name|Given Name|Prénom)$/i), nom: i(/^(Last Name|Family Name|Nom)$/i), nomc: i(/^(Name|Nom complet)$/i), org: i(/Organi[sz]ation.*Name|^Company|Société/i),
    tel: i(/Phone 1 - Value|^Phone|Téléphone/i), email: i(/E-mail 1 - Value|^E-mail|^Email/i), rue: i(/Address 1 - Street|Adresse/i), ville: i(/Address 1 - City|Ville/i), cp: i(/Address 1 - Postal Code|Code postal/i) };
  const g = (r, k) => (ix[k] >= 0 ? (r[ix[k]] || '').trim() : '');
  return rs.filter(r => r.some(Boolean)).map(r => ({ prenom: g(r, 'prenom'), nom: g(r, 'nom') || g(r, 'nomc'), raison_sociale: g(r, 'org'), telephone: g(r, 'tel').split(' ::: ')[0], email: g(r, 'email').split(' ::: ')[0], adresse: g(r, 'rue'), ville: g(r, 'ville'), code_postal: g(r, 'cp') }));
}
function ImportContacts({ fermer }) {
  const [liste, setListe] = useState(null);
  const [sel, setSel] = useState([]);
  const [att, setAtt] = useState(false);
  const [msg, setMsg] = useState(null);
  const picker = 'contacts' in navigator && 'select' in navigator.contacts;
  const chiffres = t => (t || '').replace(/\D/g, '').replace(/^33/, '0').slice(-9);
  // Enregistre les contacts comme clients, sans doublon (même téléphone ou même e-mail)
  const importer = async (l, source) => {
    setAtt(true);
    try {
      const ex = await run(sb.from('clients').select('telephone,email').is('supprime_le', null));
      const tels = new Set(ex.map(c => chiffres(c.telephone)).filter(Boolean)), mails = new Set(ex.map(c => (c.email || '').toLowerCase()).filter(Boolean));
      const nouveaux = l.filter(x => !(x.telephone && tels.has(chiffres(x.telephone))) && !(x.email && mails.has(x.email.toLowerCase())));
      const rows = nouveaux.map(x => ({ type: x.raison_sociale && !x.nom ? 'professionnel' : 'particulier', sous_type: x.raison_sociale && !x.nom ? 'societe' : null,
        nom: x.nom || x.prenom || x.telephone || null, prenom: x.nom ? x.prenom || null : null, raison_sociale: x.raison_sociale && !x.nom ? x.raison_sociale : null,
        telephone: x.telephone || null, email: x.email || null, adresse: x.adresse || null, ville: x.ville || null, code_postal: x.code_postal || null, source_import: source, cree_par: moi.profil?.id }));
      for (let i = 0; i < rows.length; i += 200) {
        const cl = await run(sb.from('clients').insert(rows.slice(i, i + 200)).select('id,adresse,code_postal,ville'));
        const sites = cl.filter(x => x.adresse).map(x => ({ client_id: x.id, nom: 'Adresse principale', adresse: x.adresse, code_postal: x.code_postal, ville: x.ville, principal: true }));
        if (sites.length) await run(sb.from('sites').insert(sites));
      }
      const doublons = l.length - nouveaux.length;
      toast(`${rows.length} client(s) enregistré(s)${doublons ? ` · ${doublons} déjà présent(s)` : ''}`); fermer(rows.length || 1);
    } catch (e) { erreur(e); setAtt(false); }
  };
  const depuisTel = async () => {
    setMsg(null);
    try {
      const dispo = navigator.contacts.getProperties ? await navigator.contacts.getProperties() : ['name', 'tel', 'email'];
      const r = await navigator.contacts.select(['name', 'tel', 'email', 'address'].filter(x => dispo.includes(x)), { multiple: true });
      if (!r || !r.length) return setMsg("Aucun contact choisi. Dans la liste qui s'ouvre, touche chaque contact à importer (une coche apparaît), puis touche « Sélectionner » ou « OK » en haut de l'écran.");
      const l = r.map(x => {
        const n = (x.name?.[0] || '').trim().split(/\s+/).filter(Boolean); const a = x.address?.[0];
        return { prenom: n.length > 1 ? n.slice(0, -1).join(' ') : '', nom: n.length > 1 ? n.at(-1) : n[0] || '', telephone: x.tel?.[0] || '', email: x.email?.[0] || '',
          adresse: a ? (a.addressLine || []).join(' ') : '', ville: a?.city || '', code_postal: a?.postalCode || '' };
      }).filter(x => x.nom || x.prenom || x.telephone);
      await importer(l, 'telephone');
    } catch (e) { setMsg("Le téléphone n'a pas donné accès aux contacts (" + (e.message || e) + "). Utilise plutôt l'import par fichier ci-dessous."); }
  };
  const depuisFichier = async () => {
    setMsg(null);
    const [f] = await choisirFichier({ accept: '.vcf,.csv,text/vcard,text/x-vcard,text/csv' });
    if (!f) return;
    const t = (await f.text()).replace(/^\ufeff/, '');
    const l = (/BEGIN:VCARD/i.test(t) ? lireVcf(t) : lireCsv(t)).filter(x => x.nom || x.raison_sociale || x.prenom || x.telephone);
    if (!l.length) return setMsg("Aucun contact lu dans ce fichier. Choisis un export « CSV Google » ou un fichier .vcf.");
    setListe(l); setSel(l.map((_, i) => i));
  };
  const go = () => importer(sel.map(i => liste[i]), 'fichier');
  return html`<${Modal} titre="Importer des contacts" onClose=${() => fermer(0)} large pied=${liste && html`<button class="btn ghost" onClick=${() => fermer(0)}>Annuler</button><button class="btn pri" disabled=${!sel.length || att} onClick=${go}>Importer ${sel.length} contact(s)</button>`}>
    ${!liste ? html`<div class="stack">
      ${msg && html`<div class="err">${msg}</div>`}
      ${att && html`<${Chargement} />`}
      ${picker && html`<button class="btn pri" disabled=${att} onClick=${depuisTel}><${Icon} n="phone" />Choisir dans les contacts du téléphone</button>
        <p class="small muted" style="margin:0">Coche les contacts dans la liste du téléphone puis valide : ils sont enregistrés tout de suite comme clients (nom, téléphone, e-mail, adresse). Les contacts déjà présents sont ignorés.</p>`}
      <button class="btn ghost" onClick=${depuisFichier}><${Icon} n="up" />Choisir un fichier (Google Contacts .csv ou .vcf)</button>
      <div class="infobox small"><b>Pour importer tout le carnet d'un coup :</b> ouvre <a href="https://contacts.google.com" target="_blank">contacts.google.com</a>, coche les contacts (ou tous), puis ⋮ › <b>Exporter</b> › « CSV Google ». Choisis ensuite ce fichier ici.</div></div>`
    : html`<div class="row between"><b>${liste.length} contact(s) trouvé(s)</b><button class="link" onClick=${() => setSel(sel.length === liste.length ? [] : liste.map((_, i) => i))}>${sel.length === liste.length ? 'Tout décocher' : 'Tout cocher'}</button></div>
      <div style="max-height:50vh;overflow:auto">${liste.map((x, i) => html`<label class="check" style="margin-bottom:6px"><input type="checkbox" checked=${sel.includes(i)} onChange=${() => setSel(sel.includes(i) ? sel.filter(y => y !== i) : [...sel, i])} />
        <div><b>${[x.nom, x.prenom].filter(Boolean).join(' ') || x.raison_sociale}</b><div class="small muted">${[x.telephone, x.email, x.ville].filter(Boolean).join(' · ')}</div></div></label>`)}</div>`}
  <//>`;
}
