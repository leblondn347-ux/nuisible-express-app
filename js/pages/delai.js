// Fiche d'intervention et consignes de sécurité (délai de rentrée), d'après le modèle de L.
import { html, useState, useEffect, Icon, Texte, Champ, Pastilles, erreur, toast } from '../ui.js';
import { moi, ref, liste, produit, nuisible, prestation, envoyerFichier, cheminEntreprise } from '../db.js';
import { adresseDe } from '../data.js';
import { nomProduit } from './nouvelle.js';
import { Signature } from './signature.js';
import { fmtDate, fmtTime, dayKey, timeKey, telecharger, fileSafe } from '../util.js';
import { pdfDelai } from '../pdf.js';

export function valeursDelai(d, p) {
  const { dossier, client, site } = d;
  const v = p.delai_rentree || {};
  const prods = d.produits.map(l => produit(l.produit_id)).filter(Boolean);
  const heures = Math.max(0, ...prods.map(x => +x.delai_rentree_heures || 0));
  const debut = p.arrivee_le || p.debut_prevu || new Date().toISOString();
  const presta = { desinsectisation: 'Désinsectisation', deratisation: 'Dératisation', desinfection: 'Désinfection' }[dossier.prestation_code] || 'Autre';
  return {
    date: v.date || dayKey(debut), heure: v.heure || timeKey(debut), facture_devis: v.facture_devis ?? (p.facture_abby || dossier.facture_abby || dossier.devis_abby || ''),
    nom: v.nom ?? client.nom_affiche, adresse: v.adresse ?? adresseDe(site || client), telephone: v.telephone ?? (client.telephone || ''), contact: v.contact ?? (site?.contact_sur_place || client.contact_nom || ''),
    type_prestation: v.type_prestation || presta,
    nuisibles: v.nuisibles ?? (dossier.dossiers_nuisibles || []).map(x => nuisible(x.nuisible_id)?.nom).filter(Boolean).join(', '),
    zones: v.zones ?? (p.zones_touchees || ''),
    produits: v.produits ?? d.produits.map(l => { const pr = produit(l.produit_id); return pr ? `${nomProduit(pr)}${l.numero_amm ? ' (' + l.numero_amm + ')' : ''}` : ''; }).filter(Boolean).join(', '),
    modes: v.modes ?? [...new Set(d.produits.map(l => l.methode).filter(m => liste('mode_application').includes(m)))],
    delai_heures: v.delai_heures ?? (heures || ''), heure_retour: v.heure_retour || '', aeration_min: v.aeration_min ?? '30',
    precautions: v.precautions ?? [], autre: v.autre || '', signataire: v.signataire ?? (p.signataire_nom || ''),
    signature_client_chemin: v.signature_client_chemin || null, signature_tech_chemin: v.signature_tech_chemin || p.signature_technicien_chemin || moi.profil?.signature_chemin || null, signe_le: v.signe_le || null,
  };
}
export const heureRetour = (h, del) => {
  if (!h || del === '' || del == null || isNaN(+del)) return '';
  const [H, M] = h.split(':').map(Number); const t = H * 60 + M + Math.round(+del * 60);
  const j = Math.floor(t / 1440); return `${String(Math.floor(t / 60) % 24).padStart(2, '0')} h ${String(t % 60).padStart(2, '0')}${j ? ` (+${j} j)` : ''}`;
};

export function OngletDelai({ d, p, maj, majTout }) {
  const [v, setV] = useState(() => valeursDelai(d, p));
  const set = k => x => { const n = { ...v, [k]: x }; if (k === 'heure' || k === 'delai_heures') n.heure_retour = heureRetour(n.heure, n.delai_heures); setV(n); maj({ delai_rentree: n }); };
  useEffect(() => { if (!v.heure_retour && v.delai_heures) set('delai_heures')(v.delai_heures); else if (!p.delai_rentree) maj({ delai_rentree: v }); }, []);
  const e = moi.entreprise || {};
  const signer = qui => async blob => {
    try {
      const chemin = cheminEntreprise('passages', p.id, `delai-${qui}-${Date.now()}.png`);
      await envoyerFichier('signatures', chemin, blob, 'image/png');
      const n = { ...v, [qui === 'client' ? 'signature_client_chemin' : 'signature_tech_chemin']: chemin, ...(qui === 'client' ? { signe_le: new Date().toISOString() } : {}) };
      setV(n); await majTout({ delai_rentree: n }); toast('Signature enregistrée');
    } catch (er) { erreur(er); }
  };
  const pdf = async () => { try { const b = await pdfDelai(d, { ...p, delai_rentree: v }); telecharger(b, `Fiche-delai-rentree_${fileSafe(d.client.nom_affiche)}_${v.date}.pdf`); } catch (er) { erreur(er); } };
  const urg = ref.modeles.delai_rentree_urgence?.contenu || 'Urgence : SAMU 15 - Centre antipoison (Marseille) 04 91 75 25 25 - Produits : FDS disponibles sur demande';
  const eng = ref.modeles.delai_rentree_engagement?.contenu || '';
  return html`<div class="stack fiche" style="margin-top:18px">
    <div class="card fhead"><div><b style="font-family:var(--f-head);text-transform:uppercase">Fiche d'intervention et consignes de sécurité</b>
      <div class="small muted">${e.nom || 'Nuisible Express 34'} · Certibiocide N° ${e.numero_certibiocide || '—'}</div></div>
      <button class="btn pri sm" onClick=${pdf}><${Icon} n="dl" />PDF (2 exemplaires)</button></div>
    <div class="card"><div class="form" style="grid-template-columns:repeat(3,1fr)">
      <${Texte} label="Date" type="date" value=${v.date} onInput=${set('date')} /><${Texte} label="Heure d'intervention" type="time" value=${v.heure} onInput=${set('heure')} />
      <${Texte} label="Facture / devis n°" value=${v.facture_devis} onInput=${set('facture_devis')} /></div></div>
    <div class="card stack"><h3><span class="fn">1</span>Informations client</h3><div class="form">
      <${Texte} label="Nom / enseigne" value=${v.nom} onInput=${set('nom')} /><${Texte} label="Téléphone" value=${v.telephone} onInput=${set('telephone')} />
      <${Texte} label="Adresse" value=${v.adresse} onInput=${set('adresse')} /><${Texte} label="Contact sur place" value=${v.contact} onInput=${set('contact')} /></div></div>
    <div class="card stack"><h3><span class="fn">2</span>Détails du traitement</h3>
      <${Champ} label="Type de prestation"><${Pastilles} multi=${false} valeurs=${v.type_prestation} onChange=${x => x && set('type_prestation')(x)} options=${['Désinsectisation', 'Dératisation', 'Désinfection', 'Autre']} /><//>
      <div class="form"><${Texte} label="Nuisible(s) ciblé(s)" value=${v.nuisibles} onInput=${set('nuisibles')} /><${Texte} label="Zones traitées" value=${v.zones} onInput=${set('zones')} />
        <${Texte} label="Produit(s) utilisé(s)" full rows="2" value=${v.produits} onInput=${set('produits')} /></div>
      <${Champ} label="Mode d'application"><${Pastilles} valeurs=${v.modes} onChange=${set('modes')} options=${['Pulvérisation', 'Nébulisation', 'Pose de gel / appâts', 'Poudrage']} /><//></div>
    <div class="card stack warnbox" style="border:2px solid var(--orange)"><h3><span class="fn">3</span>Consignes de sécurité obligatoires</h3>
      <div class="form" style="grid-template-columns:repeat(3,1fr);align-items:end">
        <${Texte} label="Délai de rentrée (heures)" type="number" step="0.5" min="0" value=${v.delai_heures} onInput=${set('delai_heures')} />
        <div><span class="fl">Heure de retour autorisée</span><p class="retour">${v.heure_retour || '—'}</p></div>
        <${Texte} label="Aération au retour (minutes)" type="number" min="0" value=${v.aeration_min} onInput=${set('aeration_min')} /></div>
      <${Champ} label="Précautions"><${Pastilles} valeurs=${v.precautions} onChange=${set('precautions')} options=${liste('precaution_rentree').length ? liste('precaution_rentree') : ['Ne pas laver les sols avant 48 h', 'Hors de portée enfants / animaux', 'Ne pas toucher / déplacer les appâts', 'Protéger aliments / vaisselle']} /><//>
      <${Texte} label="Autre précaution" value=${v.autre} onInput=${set('autre')} />
      <p class="urg">${urg}</p></div>
    <div class="card stack"><h3><span class="fn">4</span>Signatures</h3><p class="small muted" style="margin:0">${eng}</p>
      <div class="grid2e"><div class="stack"><${Texte} label="Le client (nom, « lu et approuvé »)" value=${v.signataire} onInput=${set('signataire')} />
          <${Signature} chemin=${v.signature_client_chemin} onSigne=${signer('client')} /></div>
        <div class="stack"><span class="fl">Le technicien</span><${Signature} chemin=${v.signature_tech_chemin} onSigne=${signer('tech')} /></div></div></div>
  </div>`;
}
