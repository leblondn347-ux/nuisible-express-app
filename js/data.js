// Lectures communes à plusieurs écrans
import { sb, run, lire, moi, ref } from './db.js';
import { fmtDateLong, fmtTime, fmtDate, remplir, isoFrom, addDays, dayKey } from './util.js';

// Passages d'une période (planning, accueil), avec le matériel à apporter
export async function passagesPeriode(debut, fin) {
  return lire('periode-' + dayKey(debut) + '-' + dayKey(fin), async () => {
    const pl = await run(sb.from('v_planning').select('*')
      .gte('debut_prevu', new Date(debut).toISOString()).lt('debut_prevu', new Date(fin).toISOString())
      .neq('statut', 'annule').order('debut_prevu'));
    const ids = pl.map(p => p.passage_id);
    const [ap, ps] = ids.length ? await Promise.all([
      run(sb.from('v_a_apporter').select('*').in('passage_id', ids)),
      run(sb.from('passages').select('id,nature,confirmation_envoyee_le,details,delai_rentree_requis,materiel_a_prevoir').in('id', ids)),
    ]) : [[], []];
    return pl.map(p => ({ ...p, apporter: ap.find(a => a.passage_id === p.passage_id), extra: ps.find(x => x.id === p.passage_id) || {} }));
  });
}

export async function aPlanifier() {
  return lire('a-planifier', () => run(sb.from('v_planning').select('*').in('statut', ['a_planifier', 'a_repasser'])
    .is('debut_prevu', null).order('date_cible', { nullsFirst: false }).limit(200)));
}

// Texte « à apporter » lisible
export function materiel(p) {
  const a = p.apporter || {}, x = p.extra || {}, out = [];
  if (a.postes_a_reappater) out.push(`${a.postes_a_reappater} poste(s) à réappâter`);
  if (a.postes_a_remplacer) out.push(`${a.postes_a_remplacer} poste(s) à remplacer (cassés/absents)`);
  if (a.produit) out.push(a.produit);
  const prevus = (x.details?.produits_prevus || []).map(id => ref.produits.find(r => r.id === id)?.nom_usuel || ref.produits.find(r => r.id === id)?.nom).filter(Boolean);
  prevus.forEach(n => { if (!out.includes(n) && !(a.produit || '').includes(n)) out.push(n); });
  if (x.details?.type_nacelle) out.push(x.details.type_nacelle + (x.details.hauteur_m ? ` ${x.details.hauteur_m} m` : ''));
  if (x.delai_rentree_requis) out.push('Fiche délai de rentrée');
  if (a.materiel_a_prevoir || x.materiel_a_prevoir) out.push(a.materiel_a_prevoir || x.materiel_a_prevoir);
  return out;
}

// Valeurs pour remplir les textes types
export function valeursTexte(p) {
  const e = moi.entreprise || {};
  return {
    client: p.client || p.nom_affiche || '', date: p.debut_prevu ? fmtDateLong(p.debut_prevu) : '', heure: p.debut_prevu ? fmtTime(p.debut_prevu) : '',
    adresse: [p.adresse, [p.code_postal, p.ville].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    reference: p.reference || '', prestation: p.prestation || '', consignes: p.consignes || '',
    telephone_entreprise: e.telephone || '', prochain_passage: p.prochain_passage || '', date_courte: p.debut_prevu ? fmtDate(p.debut_prevu) : '',
  };
}
export const texteType = (code, vals) => { const m = ref.modeles[code]; return m ? { objet: remplir(m.objet, vals), contenu: remplir(m.contenu, vals) } : { objet: '', contenu: '' }; };

export const nomClient = c => c ? (c.nom_affiche || c.raison_sociale || [c.nom, c.prenom].filter(Boolean).join(' ')) : '';
export const adresseDe = o => o ? [o.adresse, o.complement_adresse, [o.code_postal, o.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';

// Dossier + passage : création d'une intervention
export async function creerIntervention({ client_id, site_id, prestation_code, nuisibles = [], titre, description, ordre_service, devis_abby, reference,
  jour, heure, duree = 60, nature, produits_prevus = [], materiel_a_prevoir, delai_rentree_requis, technicien_id, enDirect, details = {}, position }) {
  const dossier = await run(sb.from('dossiers').insert({ client_id, site_id: site_id || null, prestation_code, titre: titre || null, description: description || null,
    ordre_service: ordre_service || null, devis_abby: devis_abby || null, reference: reference || null, responsable_id: technicien_id || moi.profil?.id, cree_par: moi.profil?.id }).select().single());
  if (nuisibles.length) await run(sb.from('dossiers_nuisibles').insert(nuisibles.map(n => ({ dossier_id: dossier.id, nuisible_id: n }))));
  const debut = enDirect ? new Date().toISOString() : (jour ? isoFrom(jour, heure) : null);
  const passage = await run(sb.from('passages').insert({
    dossier_id: dossier.id, nature: nature || null, statut: debut ? 'planifie' : 'a_planifier', date_cible: jour || null,
    debut_prevu: debut, fin_prevue: debut ? new Date(new Date(debut).getTime() + duree * 60000).toISOString() : null,
    technicien_id: technicien_id || moi.profil?.id, produit_prevu_id: produits_prevus[0] || null, materiel_a_prevoir: materiel_a_prevoir || null,
    delai_rentree_requis: !!delai_rentree_requis, details: { ...details, ...(produits_prevus.length ? { produits_prevus } : {}) }, cree_par: moi.profil?.id,
    arrivee_latitude: enDirect && position ? position.lat : null, arrivee_longitude: enDirect && position ? position.lng : null,
    arrivee_le: enDirect ? debut : null,
  }).select().single());
  return { dossier, passage };
}

export const lendemain = () => [addDays(new Date(), 1), addDays(new Date(), 2)].map(d => { d.setHours(0, 0, 0, 0); return d; });
