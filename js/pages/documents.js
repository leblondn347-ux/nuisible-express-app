// Documents (tout fichier) et rapports PDF classés par nom, date, n° de facture
import { html, useState, useEffect, Icon, Titre, Chargement, Vide, useCharge, Modal, ouvrir, Texte, Choix, Champ, Pastilles, erreur, toast, confirmer, demander, choisirFichier } from '../ui.js';
import { sb, run, moi, liste, estAdmin, envoyerFichier, cheminEntreprise, urlFichier, blobFichier, ajouter, modifier, lire } from '../db.js';
import { fmtDate, fmtTaille, extOf, matches, uuid, dayKey, fileSafe, telecharger, cls } from '../util.js';

const TYPES_RAPPORT = ['Rapport', 'Avis de passage', 'Fiche délai de rentrée'];
const icone = d => { const e = extOf(d.nom) || extOf(d.chemin); return /jpe?g|png|webp|heic/.test(e) ? ['IMG', 'img'] : [e ? e.toUpperCase().slice(0, 4) : 'DOC', '']; };

export async function ouvrirDoc(d) { const u = await urlFichier('documents', d.chemin); if (u) window.open(u, '_blank'); else toast("Impossible d'ouvrir le fichier.", true); }
export async function telechargerDoc(d) { try { telecharger(await blobFichier('documents', d.chemin), d.nom.includes('.') ? d.nom : d.nom + '.' + extOf(d.chemin)); } catch (e) { erreur(e); } }

export async function ajouterDocuments(fichiers, ratt = {}, type = 'Autre') {
  const out = [];
  for (const f of fichiers) {
    const id = uuid(), chemin = cheminEntreprise('documents', ratt.client_id || 'entreprise', `${dayKey(new Date())}-${fileSafe(f.name.replace(/\.[^.]+$/, ''))}-${id.slice(0, 6)}.${extOf(f.name) || 'bin'}`);
    await envoyerFichier('documents', chemin, f);
    out.push(await ajouter('documents', { id, type_document: type, nom: f.name, chemin, type_mime: f.type || null, taille_octets: f.size, date_document: dayKey(new Date()), cree_par: moi.profil?.id, ...ratt }));
  }
  return out;
}
async function renommer(d) {
  const n = await demander('Nouveau nom du document', { titre: 'Renommer', valeur: d.nom });
  if (!n || n === d.nom) return false;
  await modifier('documents', d.id, { nom: n }); d.nom = n; return true;
}
async function supprimerDoc(d) {
  if (!(await confirmer(`Supprimer « ${d.nom} » ? Il ne sera plus visible (une copie reste en sauvegarde).`, { danger: true, oui: 'Supprimer' }))) return false;
  await modifier('documents', d.id, { supprime_le: new Date().toISOString() }); return true;
}

function LigneDoc({ d, maj, client }) {
  const [ic, c] = icone(d);
  return html`<div class="drow"><div class=${cls('dic', c)}>${ic}</div>
    <div style="min-width:0"><span class="dn">${d.nom}</span><span class="small muted">${[d.type_document, fmtDate(d.date_document), d.numero_facture && 'Facture ' + d.numero_facture, client, fmtTaille(d.taille_octets)].filter(Boolean).join(' · ')}</span></div>
    <div class="dacts"><button class="btn sm ghost" onClick=${() => ouvrirDoc(d)}>Ouvrir</button><button class="iconbtn" onClick=${() => telechargerDoc(d)} aria-label="Télécharger"><${Icon} n="dl" /></button>
      ${estAdmin() && html`<button class="iconbtn" onClick=${async () => { try { if (await renommer(d)) maj(); } catch (e) { erreur(e); } }} aria-label="Renommer"><${Icon} n="pen" /></button>
        <button class="iconbtn" onClick=${async () => { try { if (await supprimerDoc(d)) maj(); } catch (e) { erreur(e); } }} aria-label="Supprimer"><${Icon} n="trash" /></button>`}</div></div>`;
}

// Bloc documents d'une fiche (client…)
export function ListeDocuments({ filtre, rattachement }) {
  const [docs, recharger] = useCharge(() => {
    let r = sb.from('documents').select('*').is('supprime_le', null).order('date_document', { ascending: false }).order('cree_le', { ascending: false });
    Object.entries(filtre).forEach(([k, v]) => (r = r.eq(k, v)));
    return lire('docs-' + JSON.stringify(filtre), () => run(r));
  }, [JSON.stringify(filtre)]);
  const [type, setType] = useState('Autre');
  const [att, setAtt] = useState(false);
  const ajout = async () => {
    const f = await choisirFichier({ multiple: true }); if (!f.length) return;
    setAtt(true);
    try { await ajouterDocuments(f, rattachement, type); toast(`${f.length} document(s) ajouté(s)`); recharger(); } catch (e) { erreur(e); }
    setAtt(false);
  };
  const zip = async () => {
    if (!docs?.length) return;
    setAtt(true);
    try {
      if (!window.JSZip) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'js/vendor/jszip.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
      const z = new window.JSZip(), noms = new Set();
      for (const d of docs) { let n = d.nom.includes('.') ? d.nom : d.nom + '.' + extOf(d.chemin); while (noms.has(n)) n = '_' + n; noms.add(n); z.file(`${d.type_document || 'Autre'}/${n.replace(/[\\/:*?"<>|]/g, '-')}`, await blobFichier('documents', d.chemin)); }
      telecharger(await z.generateAsync({ type: 'blob' }), 'Dossier-client.zip');
    } catch (e) { erreur(e); }
    setAtt(false);
  };
  return html`<div class="stack" style="gap:10px">
    <div class="row"><select class="inp" style="max-width:220px" value=${type} onChange=${e => setType(e.target.value)} aria-label="Type de document">${(liste('type_document').length ? liste('type_document') : ['Autre']).map(t => html`<option selected=${t === type}>${t}</option>`)}</select>
      <button class="btn sm" disabled=${att} onClick=${ajout}><${Icon} n="up" />${att ? 'Envoi…' : 'Ajouter des fichiers'}</button>
      ${docs?.length > 1 && html`<button class="btn sm ghost" disabled=${att} onClick=${zip}><${Icon} n="dl" />Tout télécharger (.zip)</button>`}</div>
    ${!docs ? html`<${Chargement} />` : docs.length === 0 ? html`<${Vide}>Aucun document.<//>` : html`<div class="doclist">${docs.map(d => html`<${LigneDoc} d=${d} maj=${recharger} />`)}</div>`}
  </div>`;
}

const chargerTous = types => lire('docs-' + (types ? 'rapports' : 'tous'), () => {
  let r = sb.from('documents').select('*, client:clients(nom_affiche)').is('supprime_le', null).order('date_document', { ascending: false }).limit(2000);
  if (types) r = r.in('type_document', types);
  return run(r);
});

export function Rapports() {
  const [docs, recharger] = useCharge(() => chargerTous(TYPES_RAPPORT));
  const [qq, setQ] = useState('');
  const [tri, setTri] = useState({ k: 'date_document', s: -1 });
  if (!docs) return html`<${Chargement} />`;
  const l = docs.filter(d => matches(qq, d.nom, d.client?.nom_affiche, d.numero_facture)).sort((a, b) => ((a[tri.k] || '') > (b[tri.k] || '') ? 1 : -1) * tri.s);
  const th = (k, t) => html`<th><button class=${tri.k === k ? 'on' : ''} onClick=${() => setTri({ k, s: tri.k === k ? -tri.s : 1 })}>${t} ${tri.k === k ? (tri.s > 0 ? '▲' : '▼') : ''}</button></th>`;
  const majFacture = async d => {
    const n = await demander('N° de facture Abby', { titre: 'N° de facture', valeur: d.numero_facture || '' });
    if (n == null) return;
    try { await modifier('documents', d.id, { numero_facture: n || null }); recharger(); } catch (e) { erreur(e); }
  };
  return html`
    <${Titre} sur=${`${docs.length} document(s)`} em="PDF">Rapports<//>
    <div class="search"><input class="inp" type="search" placeholder="Nom du client, n° de facture…" value=${qq} onInput=${e => setQ(e.target.value)} /></div>
    <div class="card" style="padding:8px 12px">${l.length === 0 ? html`<${Vide}>Aucun rapport. Ils apparaissent ici dès qu'un rapport est envoyé.<//>` : html`<div class="tblwrap"><table class="tbl resp">
      <thead><tr>${th('nom', 'Nom')}${th('date_document', 'Date')}${th('numero_facture', 'N° facture')}<th></th></tr></thead><tbody>
      ${l.map(d => html`<tr><td><b class="dn">${d.nom}</b><span class="small muted">${d.type_document}${d.client ? ' · ' + d.client.nom_affiche : ''}</span></td>
        <td class="num">${fmtDate(d.date_document)}</td>
        <td>${estAdmin() ? html`<button class="link" onClick=${() => majFacture(d)}>${d.numero_facture || '+ ajouter'}</button>` : d.numero_facture || '—'}</td>
        <td style="text-align:right;white-space:nowrap"><button class="btn sm ghost" onClick=${() => ouvrirDoc(d)}>Ouvrir</button>
          ${estAdmin() && html` <button class="iconbtn" onClick=${async () => { try { if (await renommer(d)) recharger(); } catch (e) { erreur(e); } }} aria-label="Renommer"><${Icon} n="pen" /></button>`}</td></tr>`)}
      </tbody></table></div>`}</div>`;
}

export function Documents() {
  const [docs, recharger] = useCharge(() => chargerTous(null));
  const [qq, setQ] = useState('');
  const [type, setType] = useState('');
  const [att, setAtt] = useState(false);
  const [typeAjout, setTypeAjout] = useState('Autre');
  if (!docs) return html`<${Chargement} />`;
  const types = [...new Set(docs.map(d => d.type_document))];
  const l = docs.filter(d => (!type || d.type_document === type) && matches(qq, d.nom, d.client?.nom_affiche, d.numero_facture, d.type_document));
  const ajout = async fichiers => {
    if (!fichiers.length) return;
    setAtt(true);
    try { await ajouterDocuments(fichiers, {}, typeAjout); toast(`${fichiers.length} document(s) ajouté(s)`); recharger(); } catch (e) { erreur(e); }
    setAtt(false);
  };
  return html`
    <${Titre} sur="Tous les fichiers" em="documents">Mes<//>
    <div class="grid2">
      <div class="stack">
        <div class="search"><input class="inp" type="search" placeholder="Rechercher…" value=${qq} onInput=${e => setQ(e.target.value)} />
          <${Pastilles} multi=${false} valeurs=${type} onChange=${v => setType(v || '')} options=${types} /></div>
        <div class="card">${l.length === 0 ? html`<${Vide}>Aucun document.<//>` : html`<div class="doclist">${l.map(d => html`<${LigneDoc} d=${d} maj=${recharger} client=${d.client?.nom_affiche} />`)}</div>`}</div>
      </div>
      <div class="card stack"><h3>Ajouter</h3>
        <${Choix} label="Type de document" vide=${false} value=${typeAjout} onChange=${setTypeAjout} options=${liste('type_document').length ? liste('type_document') : ['Autre']} />
        <button class="drop" disabled=${att} onClick=${async () => ajout(await choisirFichier({ multiple: true }))}
          onDragOver=${e => e.preventDefault()} onDrop=${e => { e.preventDefault(); ajout([...e.dataTransfer.files]); }}>
          <${Icon} n="up" /><b>${att ? 'Envoi en cours…' : 'Choisir ou glisser des fichiers'}</b><span class="small muted">Assurance, Certibiocide, modèles, contrats… Pour un client, passe par sa fiche.</span></button>
      </div></div>`;
}
