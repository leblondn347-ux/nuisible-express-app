// Rapport : PDF, choix des destinataires, envoi (Outlook via le partage du téléphone, ou e-mail sur l'ordinateur)
import { html, useState, useEffect, Icon, Chargement, Vide, Champ, erreur, toast, confirmer } from '../ui.js';
import { sb, run, moi, prestation, ajouter, envoyerFichier, cheminEntreprise, urlFichier, modifier, estAdmin } from '../db.js';
import { valeursTexte, adresseDe, texteType } from '../data.js';
import { fmtDate, fmtDateTime, telecharger, fileSafe, mailHref, dayKey, uuid, cls } from '../util.js';
import { pdfRapport, pdfDelai } from '../pdf.js';

export const nomRapport = (d, p) => [d.client.nom_affiche, dayKey(p.depart_le || p.arrivee_le || p.debut_prevu || new Date()), p.facture_abby || d.dossier.facture_abby].filter(Boolean).join(' – ');

export function OngletRapport({ d, p, majTout, recharger }) {
  const { client, payeur, dossier } = d;
  const adresses = [...new Set([client.email, ...(client.emails_copie || []), payeur?.email, ...(payeur?.emails_copie || [])].filter(Boolean))];
  const [dest, setDest] = useState(() => adresses.filter(a => payeur ? [payeur.email, ...(payeur.emails_copie || [])].includes(a) || a === client.email : true));
  const [autre, setAutre] = useState('');
  const [att, setAtt] = useState(null);
  const [docs, setDocs] = useState(null);
  const [envoye, setEnvoye] = useState(null);
  const chargerDocs = () => sb.from('documents').select('*').eq('passage_id', p.id).is('supprime_le', null).order('cree_le', { ascending: false }).then(r => setDocs(r.data || []));
  useEffect(() => { chargerDocs(); }, []);
  const fini = ['fait', 'rapport_envoye', 'facture', 'a_repasser'].includes(p.statut);
  const nom = nomRapport(d, p);
  const avis = p.client_absent;

  const generer = async () => {
    const fichiers = [];
    const b = await pdfRapport(d, p);
    fichiers.push({ blob: b, nom: (avis ? 'Avis de passage – ' : '') + nom + '.pdf', type: avis ? 'Avis de passage' : 'Rapport' });
    if (p.delai_rentree_requis && p.delai_rentree) fichiers.push({ blob: await pdfDelai(d, p), nom: 'Fiche délai de rentrée – ' + nom + '.pdf', type: 'Fiche délai de rentrée' });
    return fichiers;
  };
  const apercu = async () => {
    setAtt('apercu');
    try { const [f] = await generer(); const u = URL.createObjectURL(f.blob); const w = window.open(u, '_blank'); if (!w) telecharger(f.blob, f.nom); }
    catch (e) { erreur(e); } setAtt(null);
  };
  const ranger = async fichiers => {
    const ids = [];
    for (const f of fichiers) {
      const id = uuid(), chemin = cheminEntreprise('documents', client.id, `${dayKey(new Date())}-${fileSafe(f.nom.replace(/\.pdf$/, ''))}-${id.slice(0, 6)}.pdf`);
      await envoyerFichier('documents', chemin, f.blob, 'application/pdf');
      await ajouter('documents', { id, type_document: f.type, nom: f.nom, chemin, type_mime: 'application/pdf', taille_octets: f.blob.size, client_id: client.id, site_id: dossier.site_id, dossier_id: dossier.id,
        passage_id: p.id, date_document: dayKey(p.depart_le || p.debut_prevu || new Date()), numero_facture: p.facture_abby || dossier.facture_abby || null, cree_par: moi.profil?.id });
      ids.push(id);
    }
    return ids;
  };
  const envoyer = async () => {
    const a = [...dest, ...autre.split(/[,; ]+/).filter(x => x.includes('@'))];
    if (!a.length && !navigator.canShare) return toast('Choisis au moins un destinataire.', true);
    setAtt('envoi');
    try {
      const fichiers = await generer();
      const ids = await ranger(fichiers);
      const suivant = d.autres.find(x => x.numero > p.numero && ['a_planifier', 'planifie'].includes(x.statut));
      const v = valeursTexte({ client: client.nom_affiche, debut_prevu: p.arrivee_le || p.debut_prevu, adresse: adresseDe(d.site || client), reference: dossier.reference, prestation: prestation(dossier.prestation_code).nom,
        prochain_passage: suivant?.debut_prevu ? `Prochain passage prévu le ${fmtDateTime(suivant.debut_prevu)}.` : suivant?.date_cible ? `Prochain passage prévu vers le ${fmtDate(suivant.date_cible)}.` : '' });
      const t = avis ? texteType('email_avis_passage', v) : texteType('email_rapport', v);
      const files = fichiers.map(f => new File([f.blob], f.nom, { type: 'application/pdf' }));
      let mode = 'mail';
      if (navigator.canShare && navigator.canShare({ files }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
        try { await navigator.clipboard?.writeText(a.join(', ')); } catch (e) { }
        try { await navigator.share({ files, title: t.objet, text: t.contenu }); mode = 'partage'; }
        catch (e) { if (e.name === 'AbortError') { setAtt(null); chargerDocs(); return; } mode = 'mail'; }
      }
      if (mode === 'mail') { fichiers.forEach(f => telecharger(f.blob, f.nom)); setTimeout(() => { location.href = mailHref(a, t.objet, t.contenu); }, 600); }
      setEnvoye({ mode, a, ids, t });
      chargerDocs();
    } catch (e) { erreur(e); }
    setAtt(null);
  };
  const confirmerEnvoi = async () => {
    try {
      await ajouter('envois', { type: avis ? 'avis_passage' : 'rapport', passage_id: p.id, client_id: client.id, canal: 'email', destinataires: envoye.a, objet: envoye.t.objet, corps: envoye.t.contenu,
        documents_joints: envoye.ids, statut: 'envoye', envoye_le: new Date().toISOString(), cree_par: moi.profil?.id });
      if (['fait', 'a_repasser'].includes(p.statut)) await majTout({ statut: p.statut === 'a_repasser' ? 'a_repasser' : 'rapport_envoye' });
      toast('Rapport noté comme envoyé'); setEnvoye(null);
    } catch (e) { erreur(e); }
  };
  const ouvrirDoc = async doc => { const u = await urlFichier('documents', doc.chemin); if (u) window.open(u, '_blank'); };

  return html`<div class="grid2" style="margin-top:18px">
    <div class="stack">
      ${!fini && html`<div class="infobox">L'intervention n'est pas encore terminée : tu peux regarder l'aperçu, puis la terminer dans l'onglet « Fin et signature ».</div>`}
      <div class="card stack"><div class="ch" style="margin:0"><h3>${avis ? 'Avis de passage' : 'Rapport d’intervention'}</h3><span class="small muted">${nom}</span></div>
        <${Champ} label="Envoyer à">
          ${adresses.length === 0 ? html`<p class="small muted" style="margin:0">Aucune adresse e-mail sur la fiche du client${payeur ? ' ni du syndic' : ''}.</p>` : html`<div class="stack" style="gap:6px">
            ${adresses.map(a => html`<label class="check" style="padding:10px 12px"><input type="checkbox" checked=${dest.includes(a)} onChange=${() => setDest(dest.includes(a) ? dest.filter(x => x !== a) : [...dest, a])} />
              <div><b>${a}</b><div class="small muted">${a === client.email || (client.emails_copie || []).includes(a) ? client.nom_affiche : payeur?.nom_affiche}</div></div></label>`)}</div>`}
          <input class="inp" style="margin-top:8px" type="email" placeholder="Autre adresse (facultatif)" value=${autre} onInput=${e => setAutre(e.target.value)} /><//>
        <div class="row">
          <button class="btn ghost" disabled=${!!att} onClick=${apercu}><${Icon} n="eye" />${att === 'apercu' ? 'Préparation…' : 'Aperçu PDF'}</button>
          <button class="btn pri" disabled=${!!att} onClick=${envoyer}><${Icon} n="send" />${att === 'envoi' ? 'Préparation…' : p.statut === 'rapport_envoye' ? 'Renvoyer' : 'Envoyer'}</button></div>
        <p class="small muted" style="margin:0">Sur le téléphone, choisis <b>Outlook</b> dans la liste : le PDF est déjà joint (les adresses sont copiées, il suffit de les coller). Sur l'ordinateur, le PDF est téléchargé et un e-mail s'ouvre : glisse-y le fichier téléchargé.</p>
        ${envoye && html`<div class="okbox stack" style="gap:8px"><span>${envoye.mode === 'partage' ? 'Le partage a été ouvert.' : 'L’e-mail est prêt dans ta messagerie et le PDF est téléchargé.'} Une fois l’e-mail parti :</span>
          <div class="row"><button class="btn sm pri" onClick=${confirmerEnvoi}><${Icon} n="check" />C'est envoyé</button><button class="btn sm ghost" onClick=${() => setEnvoye(null)}>Pas encore</button></div></div>`}
      </div>
    </div>
    <div class="card"><div class="ch"><h3>Documents de ce passage</h3></div>
      ${!docs ? html`<${Chargement} />` : docs.length === 0 ? html`<${Vide}>Aucun PDF enregistré pour l'instant.<//>` : docs.map(doc => html`<div class="drow"><div class="dic">PDF</div>
        <div><span class="dn">${doc.nom}</span><span class="small muted">${fmtDate(doc.date_document)}${doc.numero_facture ? ' · ' + doc.numero_facture : ''}</span></div>
        <div class="dacts"><button class="btn sm ghost" onClick=${() => ouvrirDoc(doc)}>Ouvrir</button></div></div>`)}
    </div></div>`;
}
