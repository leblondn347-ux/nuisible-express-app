// Produits / liste AMM (seul le nom est obligatoire)
import { html, useState, useEffect, Icon, Titre, Vide, Modal, ouvrir, Texte, Choix, Champ, Pastilles, Bascule, erreur, toast, choisirFichier, useRefData } from '../ui.js';
import { sb, run, ref, chargerRef, estAdmin, envoyerFichier, cheminEntreprise, urlFichier, ajouter, moi } from '../db.js';
import { matches, fileSafe, uuid, dayKey } from '../util.js';
import { nomProduit } from './nouvelle.js';

const STATUT = { verifie: ['N° vérifié', 'ok'], a_verifier: ['À vérifier', 'warn'], introuvable: ['N° à compléter', 'bad'], non_biocide: ['Non biocide', ''] };
const libLien = k => k.replace(/_url$/, '').replace(/_(\d)$/, ' $1').replace(/^fds/, 'FDS').replace(/^fiche_technique/, 'Fiche technique').replace(/^page/, 'Page').replace(/^etiquette/, 'Étiquette')
  .replace(/_edialux/, ' Edialux').replace(/_ensystex/, ' Ensystex').replace(/_/g, ' ');

export function Produits({ q }) {
  useRefData();
  const [qq, setQ] = useState('');
  const [f, setF] = useState('tous');
  useEffect(() => { if (q.id && ref.produits.find(p => p.id === q.id)) modif(ref.produits.find(p => p.id === q.id)); }, []);
  const modif = async p => { if (await ouvrir(FormProduit, { p })) chargerRef(); };
  const tp = p => (p.types_tp || []).join(' ') + ' ' + (p.type_biocide || '');
  const liste = ref.produits.filter(p => (f === 'tous' || (f === 'tp14' && /TP14/.test(tp(p))) || (f === 'tp18' && /TP18/.test(tp(p))) || (f === 'des' && /TP[1-5]\b|TP1-5|désinf/i.test(tp(p))) || (f === 'averif' && ['a_verifier', 'introuvable'].includes(p.statut_verif)))
    && matches(qq, p.nom, p.nom_usuel, p.numero_amm, p.fabricant, p.fournisseur, (p.substances_actives || []).map(s => s.nom).join(' ')));
  return html`
    <${Titre} sur=${`${ref.produits.length} produit(s)`} em="AMM" actions=${html`<button class="btn pri" onClick=${() => modif(null)}><${Icon} n="plus" />Nouveau produit</button>`}>Produits<//>
    <div class="search"><input class="inp" type="search" placeholder="Nom, n° AMM, substance…" value=${qq} onInput=${e => setQ(e.target.value)} />
      <${Pastilles} multi=${false} valeurs=${f} onChange=${v => setF(v || 'tous')} options=${[['tous', 'Tous'], ['tp14', 'Rodenticides TP14'], ['tp18', 'Insecticides TP18'], ['des', 'Désinfectants'], ['averif', 'À compléter']]} /></div>
    ${liste.length === 0 ? html`<div class="card"><${Vide}>Aucun produit.<//></div>` : html`<div class="prods">${liste.map(p => {
      const s = STATUT[p.statut_verif] || STATUT.a_verifier;
      const sa = (p.substances_actives || []).map(x => [x.nom, x.concentration].filter(Boolean).join(' ')).join(' + ');
      return html`<button class="card prod" onClick=${() => modif(p)}><div class="row between" style="align-items:flex-start;flex-wrap:nowrap"><div><h4>${nomProduit(p)}</h4><div class="tp">${p.type_biocide || ''}${p.nom_usuel && p.nom_usuel !== p.nom ? ' · ' + p.nom : ''}</div></div><span class=${'pill ' + s[1]}>${s[0]}</span></div>
        <dl><dt>N° AMM</dt><dd>${p.numero_amm || '—'}</dd>${sa && html`<dt>Substance</dt><dd>${sa}</dd>`}${p.formulation && html`<dt>Forme</dt><dd>${p.formulation}</dd>`}${p.delai_rentree && html`<dt>Rentrée</dt><dd>${p.delai_rentree}</dd>`}</dl></button>`;
    })}</div>`}`;
}

function FormProduit({ fermer, p }) {
  const [f, setF] = useState(() => p ? { ...p, types_tp: (p.types_tp || []).join(', '), substances: (p.substances_actives || []).map(s => [s.nom, s.concentration].filter(Boolean).join(' : ')).join('\n') } : { statut_verif: 'a_verifier', actif: true, liens: {} });
  const [nuis, setNuis] = useState(p ? ref.prodNuis.filter(x => x.produit_id === p.id).map(x => x.nuisible_id) : []);
  const [docs, setDocs] = useState([]);
  const set = k => v => setF(x => ({ ...x, [k]: v }));
  useEffect(() => { if (p) sb.from('documents').select('*').eq('produit_id', p.id).is('supprime_le', null).then(r => setDocs(r.data || [])); }, []);
  const go = async () => {
    if (!f.nom) return toast('Le nom est obligatoire.', true);
    try {
      const row = { nom: f.nom, nom_usuel: f.nom_usuel || null, fabricant: f.fabricant || null, fournisseur: f.fournisseur || null, numero_amm: f.numero_amm || null, type_biocide: f.type_biocide || null,
        types_tp: (f.types_tp || '').split(/[,; ]+/).filter(Boolean), formulation: f.formulation || null,
        substances_actives: (f.substances || '').split('\n').filter(Boolean).map(l => { const [nom, concentration] = l.split(':').map(x => x.trim()); return { nom, concentration: concentration || null }; }),
        usage: f.usage || null, dose: f.dose || null, unite: f.unite || null, remanence: f.remanence || null, delai_rentree: f.delai_rentree || null,
        delai_rentree_heures: f.delai_rentree_heures === '' || f.delai_rentree_heures == null ? null : +f.delai_rentree_heures, statut_verif: f.statut_verif, note_verif: f.note_verif || null, actif: f.actif !== false };
      const r = p ? await run(sb.from('produits').update(row).eq('id', p.id).select().single()) : await run(sb.from('produits').insert(row).select().single());
      const avant = p ? ref.prodNuis.filter(x => x.produit_id === p.id).map(x => x.nuisible_id) : [];
      const aj = nuis.filter(x => !avant.includes(x)), en = avant.filter(x => !nuis.includes(x));
      if (aj.length) await run(sb.from('produits_nuisibles').insert(aj.map(n => ({ produit_id: r.id, nuisible_id: n }))));
      if (en.length) await run(sb.from('produits_nuisibles').delete().eq('produit_id', r.id).in('nuisible_id', en));
      toast('Produit enregistré'); fermer(r);
    } catch (e) { erreur(e); }
  };
  const ajoutDoc = async type => {
    if (!p) return toast("Enregistre d'abord le produit.", true);
    const [fi] = await choisirFichier({ accept: '.pdf,image/*' }); if (!fi) return;
    try {
      const id = uuid(), chemin = cheminEntreprise('produits', p.id, `${fileSafe(type + '-' + p.nom)}-${id.slice(0, 6)}.${fi.name.split('.').pop()}`);
      await envoyerFichier('documents', chemin, fi);
      const doc = await ajouter('documents', { id, type_document: type, nom: `${type} – ${p.nom}`, chemin, type_mime: fi.type, taille_octets: fi.size, produit_id: p.id, date_document: dayKey(new Date()), cree_par: moi.profil?.id });
      await run(sb.from('produits').update(type.startsWith('Fiche de') ? { fds_document_id: id } : { fiche_technique_document_id: id }).eq('id', p.id));
      setDocs(x => [...x, doc]); toast('Document ajouté');
    } catch (e) { erreur(e); }
  };
  const parPresta = ref.prestations.filter(pr => ref.nuisibles.some(n => n.prestation_code === pr.code));
  return html`<${Modal} titre=${p ? nomProduit(p) : 'Nouveau produit'} large onClose=${() => fermer(null)} pied=${html`<button class="btn ghost" onClick=${() => fermer(null)}>Annuler</button><button class="btn pri" onClick=${go}>Enregistrer</button>`}>
    <div class="form">
      <${Texte} label="Nom du produit *" value=${f.nom} onInput=${set('nom')} /><${Texte} label="Nom que j'utilise" value=${f.nom_usuel} onInput=${set('nom_usuel')} />
      <${Texte} label="N° AMM (ou autre n°)" value=${f.numero_amm} onInput=${set('numero_amm')} placeholder="ex. FR-2014-0127" />
      <${Choix} label="Vérification du n°" vide=${false} value=${f.statut_verif} onChange=${set('statut_verif')} options=${Object.entries(STATUT).map(([k, [l]]) => [k, l])} />
      <${Texte} label="Type" value=${f.type_biocide} onInput=${set('type_biocide')} placeholder="TP14 rodenticide, TP18 insecticide…" /><${Texte} label="Types TP" value=${f.types_tp} onInput=${set('types_tp')} placeholder="TP14, TP18" />
      <${Texte} label="Fabricant" value=${f.fabricant} onInput=${set('fabricant')} /><${Texte} label="Fournisseur" value=${f.fournisseur} onInput=${set('fournisseur')} />
      <${Texte} label="Formulation" value=${f.formulation} onInput=${set('formulation')} placeholder="bloc, pâte, gel…" /><${Texte} label="Unité" value=${f.unite} onInput=${set('unite')} placeholder="g, mL, bloc…" />
      <${Texte} label="Substance(s) active(s)" full rows="2" value=${f.substances} onInput=${set('substances')} hint="Une par ligne, ex. « Brodifacoum : 25 ppm »" />
      <${Texte} label="Dose" value=${f.dose} onInput=${set('dose')} /><${Texte} label="Rémanence" value=${f.remanence} onInput=${set('remanence')} />
      <${Texte} label="Délai de rentrée (texte)" value=${f.delai_rentree} onInput=${set('delai_rentree')} /><${Texte} label="Délai de rentrée (heures)" type="number" step="0.5" value=${f.delai_rentree_heures} onInput=${set('delai_rentree_heures')} hint="Sert à remplir la fiche délai de rentrée" />
      <${Texte} label="Usage" full rows="2" value=${f.usage} onInput=${set('usage')} /><${Texte} label="Notes" full rows="2" value=${f.note_verif} onInput=${set('note_verif')} />
    </div>
    <${Champ} label="Nuisibles ciblés (pour les propositions)">${parPresta.map(pr => html`<div style="margin-bottom:8px"><div class="small muted">${pr.nom}</div>
      <${Pastilles} couleur=${pr.couleur} valeurs=${nuis} onChange=${setNuis} options=${ref.nuisibles.filter(n => n.prestation_code === pr.code).map(n => [n.id, (n.parent_id ? '↳ ' : '') + n.nom])} /></div>`)}<//>
    <${Champ} label="Fiches du produit">
      <div class="stack" style="gap:6px">
        ${docs.map(doc => html`<button class="btn sm ghost" style="justify-content:flex-start" onClick=${async () => window.open(await urlFichier('documents', doc.chemin), '_blank')}><${Icon} n="doc" />${doc.nom}</button>`)}
        ${Object.entries(f.liens || {}).filter(([, u]) => typeof u === 'string' && u.startsWith('http')).map(([k, u]) => html`<a class="btn sm ghost" style="justify-content:flex-start" href=${u} target="_blank" rel="noopener"><${Icon} n="doc" />${libLien(k)}</a>`)}
        <div class="row"><button class="btn sm" onClick=${() => ajoutDoc('Fiche de sécurité (FDS)')}><${Icon} n="up" />Ajouter la FDS</button><button class="btn sm" onClick=${() => ajoutDoc('Fiche technique')}><${Icon} n="up" />Ajouter la fiche technique</button></div>
      </div><//>
    <${Bascule} on=${f.actif !== false} onChange=${set('actif')} label="Produit utilisé actuellement" aide="Décoché : il n'est plus proposé mais reste dans l'historique." />
  <//>`;
}
