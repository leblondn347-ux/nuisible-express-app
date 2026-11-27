// Documents PDF : rapport d'intervention, avis de passage, fiche délai de rentrée
import { sb, run, moi, ref, produit, nuisible, prestation, urlFichier, nomTech } from './db.js';
import { adresseDe } from './data.js';
import { fmtDate, fmtTime, fmtDateTime, fmtDuree, ETATS_POSTE, CATEGORIES_POSTE, MOMENTS } from './util.js';
import { heureRetour, valeursDelai } from './pages/delai.js';

const OR = [217, 84, 30], NOIR = [17, 17, 17], GRIS = [107, 105, 101], LIGNE = [220, 211, 195], FOND = [243, 238, 227];
const nomP = p => p ? (p.nom_usuel || p.nom) : '';

async function image(bucket, chemin, max = 1400, jpeg = true) {
  if (!chemin) return null;
  try {
    const url = await urlFichier(bucket, chemin);
    if (!url) return null;
    const blob = await (await fetch(url)).blob();
    const bmp = await createImageBitmap(blob);
    const r = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * r); c.height = Math.round(bmp.height * r);
    const x = c.getContext('2d');
    if (jpeg) { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); }
    x.drawImage(bmp, 0, 0, c.width, c.height);
    return { data: c.toDataURL(jpeg ? 'image/jpeg' : 'image/png', 0.82), w: c.width, h: c.height, fmt: jpeg ? 'JPEG' : 'PNG' };
  } catch (e) { console.warn('image', e); return null; }
}

const chargerJsPDF = () => window.jspdf ? Promise.resolve() : new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'js/vendor/jspdf.js'; s.onload = res; s.onerror = () => rej(new Error('Module PDF introuvable')); document.head.appendChild(s); });

// Petit moteur de mise en page
function doc(orient = 'p') {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: orient, unit: 'mm', format: 'a4', compress: true });
  const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight(), M = 14;
  const o = { pdf, W, H, M, y: M, cw: W - 2 * M };
  o.place = h => { if (o.y + h > H - 16) { pdf.addPage(); o.y = M; return true; } return false; };
  o.txt = (t, x, y, { size = 9.5, bold, color = NOIR, w, align } = {}) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(size); pdf.setTextColor(...color);
    const lines = w ? pdf.splitTextToSize(String(t ?? ''), w) : [String(t ?? '')];
    pdf.text(lines, x, y, { align, baseline: 'top' });
    return lines.length * size * 0.42;
  };
  o.hauteur = (t, w, size = 9.5) => { pdf.setFontSize(size); return pdf.splitTextToSize(String(t ?? ''), w).length * size * 0.42; };
  o.section = t => { o.place(16); o.y += 3; pdf.setFillColor(...OR); pdf.rect(M, o.y, 3, 6, 'F'); o.txt(t.toUpperCase(), M + 5, o.y + 0.6, { size: 10.5, bold: true }); o.y += 9; };
  o.para = (t, { size = 9.5, color } = {}) => { if (!t) return; const lines = pdf.setFontSize(size).splitTextToSize(String(t), o.cw); for (const l of lines) { o.place(5); o.txt(l, M, o.y, { size, color }); o.y += size * 0.42; } o.y += 1.5; };
  o.kv = (paires, cols = 2) => {
    const pw = o.cw / cols; const ps = paires.filter(([, v]) => v);
    for (let i = 0; i < ps.length; i += cols) {
      const h = Math.max(...ps.slice(i, i + cols).map(([, v]) => o.hauteur(v, pw - 4))) + 5;
      o.place(h);
      ps.slice(i, i + cols).forEach(([k, v], j) => { o.txt(k.toUpperCase(), M + j * pw, o.y, { size: 6.8, bold: true, color: GRIS }); o.txt(v, M + j * pw, o.y + 3.2, { w: pw - 4 }); });
      o.y += h + 1;
    }
  };
  o.table = (cols, rows, { size = 8.5 } = {}) => {
    const tw = cols.reduce((s, c) => s + c.w, 0), k = o.cw / tw; cols.forEach(c => (c.ww = c.w * k));
    const entete = () => { pdf.setFillColor(...FOND); pdf.rect(M, o.y, o.cw, 6.5, 'F'); let x = M; cols.forEach(c => { o.txt(c.t.toUpperCase(), x + 1.5, o.y + 1.6, { size: 6.8, bold: true, color: GRIS }); x += c.ww; }); o.y += 7; };
    o.place(14); entete();
    rows.forEach(r => {
      const h = Math.max(...r.map((v, i) => o.hauteur(v?.t ?? v, cols[i].ww - 3, size))) + 3;
      if (o.place(h)) entete();
      let x = M;
      r.forEach((v, i) => {
        const val = v?.t ?? v;
        if (v?.fill) { pdf.setFillColor(...v.fill); pdf.roundedRect(x + 1, o.y + 0.6, Math.min(cols[i].ww - 2, 10), h - 1.6, 1, 1, 'F'); }
        o.txt(val, x + 1.5, o.y + 1.5, { size, w: cols[i].ww - 3, bold: v?.bold, color: v?.color || NOIR }); x += cols[i].ww;
      });
      pdf.setDrawColor(...LIGNE); pdf.setLineWidth(0.2); pdf.line(M, o.y + h, M + o.cw, o.y + h); o.y += h;
    });
    o.y += 3;
  };
  o.img = (im, w, x = M) => { if (!im) return 0; const h = w * im.h / im.w; pdf.addImage(im.data, im.fmt, x, o.y, w, h); return h; };
  return o;
}

async function entete(o, titre, sousTitre) {
  const { pdf, M, W } = o, e = moi.entreprise || {};
  const logo = await image('entreprise', e.logo_chemin, 600, false);
  if (logo) { const h = Math.min(20, 50 * logo.h / logo.w); pdf.addImage(logo.data, logo.fmt, M, M, h * logo.w / logo.h, h); }
  else { o.txt('NUISIBLE', M, M, { size: 20, bold: true, color: OR }); o.txt('EXPRESS 34', M, M + 8, { size: 15, bold: true }); }
  const infos = [e.nom, adresseDe(e), [e.telephone, e.email].filter(Boolean).join(' · '), e.siret && 'SIRET ' + e.siret, e.numero_certibiocide && 'Certibiocide N° ' + e.numero_certibiocide].filter(Boolean);
  infos.forEach((l, i) => o.txt(l, W - M, M + i * 3.6, { size: 7.5, color: i ? GRIS : NOIR, bold: !i, align: 'right' }));
  o.y = M + 24;
  pdf.setFillColor(...NOIR); pdf.rect(M, o.y, o.cw, 13, 'F');
  o.txt(titre, M + 4, o.y + 2.2, { size: 13, bold: true, color: [255, 255, 255] });
  if (sousTitre) o.txt(sousTitre, W - M - 4, o.y + 3.4, { size: 9, color: [243, 238, 227], align: 'right' });
  pdf.setFillColor(...OR); pdf.rect(M, o.y + 13, o.cw, 1.2, 'F');
  o.y += 19;
}
function pieds(o, texte) {
  const { pdf, W, H, M } = o, n = pdf.getNumberOfPages(), e = moi.entreprise || {};
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i); pdf.setDrawColor(...LIGNE); pdf.line(M, H - 12, W - M, H - 12);
    o.txt(texte || [e.nom, e.telephone, e.email].filter(Boolean).join(' · '), M, H - 10, { size: 7, color: GRIS });
    o.txt(`Page ${i} / ${n}`, W - M, H - 10, { size: 7, color: GRIS, align: 'right' });
  }
}

// ---------- Rapport d'intervention ----------
export async function pdfRapport(d, p) {
  await chargerJsPDF();
  const { dossier, client, payeur, site, autres } = d;
  const presta = prestation(dossier.prestation_code);
  const o = doc(), { pdf, M } = o;
  const avis = p.client_absent;
  // Postes et relevés
  let postes = [], rel = [], plans = [], histo = [];
  if (site) {
    [postes, rel, plans] = await Promise.all([
      run(sb.from('postes').select('*').eq('site_id', site.id).is('supprime_le', null).order('numero')),
      run(sb.from('releves_postes').select('*, releves_produits(*)').eq('passage_id', p.id)),
      run(sb.from('plans').select('*').eq('site_id', site.id).is('supprime_le', null).order('ordre')),
    ]);
    if (rel.length) histo = await run(sb.from('v_historique_postes').select('*').eq('site_id', site.id).order('date_passage', { ascending: false }).limit(2000));
  }
  const relDe = id => rel.find(r => r.poste_id === id);
  const postesRel = postes.filter(po => relDe(po.id) || po.actif);

  await entete(o, avis ? "AVIS DE PASSAGE" : "RAPPORT D'INTERVENTION", `${presta.nom} · Dossier ${dossier.reference}`);
  const lieu = site || client;
  o.kv([
    ['Client', client.nom_affiche], ['Lieu d\'intervention', [site?.nom, adresseDe(lieu)].filter(Boolean).join(' — ')],
    ['Donneur d\'ordre / facturé', payeur?.nom_affiche], ['Contact', client.telephone || client.email],
    ['Date', fmtDate(p.arrivee_le || p.debut_prevu)], ['Horaires', p.arrivee_le ? `${fmtTime(p.arrivee_le)}${p.depart_le ? ' – ' + fmtTime(p.depart_le) : ''}${p.duree_minutes ? ' (' + fmtDuree(p.duree_minutes) + ')' : ''}` : fmtTime(p.debut_prevu)],
    ['Passage', `${p.numero} / ${autres.length}${p.nature ? ' · ' + p.nature : ''}`], ['Technicien', nomTech(p.technicien_id) + (moi.entreprise?.numero_certibiocide ? ' · Certibiocide ' + moi.entreprise.numero_certibiocide : '')],
    ['N° ordre de service', dossier.ordre_service], ['Devis / facture Abby', [dossier.devis_abby && 'Devis ' + dossier.devis_abby, (p.facture_abby || dossier.facture_abby) && 'Facture ' + (p.facture_abby || dossier.facture_abby)].filter(Boolean).join(' · ')],
  ]);

  if (avis) {
    o.section('Avis de passage');
    o.para(`Nous sommes passés le ${fmtDate(p.arrivee_le || p.debut_prevu)} à ${fmtTime(p.arrivee_le || p.debut_prevu)} pour l'intervention prévue, mais nous n'avons pas pu accéder aux lieux.`);
    o.para(`Merci de nous recontacter${moi.entreprise?.telephone ? ' au ' + moi.entreprise.telephone : ''} pour convenir d'un nouveau rendez-vous.`);
  } else {
    const nuis = (dossier.dossiers_nuisibles || []).map(x => nuisible(x.nuisible_id)?.nom).filter(Boolean).join(', ');
    const det = p.details || {};
    o.section('Constats');
    o.kv([['Nuisible(s) ciblé(s)', nuis], ['Nuisible constaté', p.nuisible_constate], ['Niveau d\'infestation', p.niveau_infestation], ['Zones touchées / traitées', p.zones_touchees],
      ['Matériel', det.type_nacelle && det.type_nacelle + (det.hauteur_m ? ` (${det.hauteur_m} m)` : '')], ['Nature des travaux', det.nature_travaux],
      ['Dispositifs', (det.dispositifs || []).join(', ')], ['Quantité réalisée', det.quantite || (det.metres_poses && det.metres_poses + ' m')],
      ['Sécurité', [det.balisage && 'Balisage installé', det.epi && 'EPI vérifiés'].filter(Boolean).join(' · ')], ['Matériel utilisé', det.materiel]]);
    if (p.constats) o.para(p.constats);

    if (d.produits.length) {
      o.section('Produits utilisés');
      o.table([{ t: 'Produit', w: 34 }, { t: 'N° AMM', w: 22 }, { t: 'Lot', w: 14 }, { t: 'Quantité', w: 14 }, { t: 'Application', w: 20 }, { t: 'Zone', w: 24 }],
        d.produits.map(l => { const pr = produit(l.produit_id); return [{ t: nomP(pr) + (pr?.type_biocide ? '\n' + pr.type_biocide : ''), bold: true }, l.numero_amm || '', l.numero_lot || '', l.quantite != null ? `${l.quantite} ${l.unite || ''}` : '', l.methode || '', l.zone || '']; }));
    }

    if (rel.length) {
      const c = v => rel.filter(r => r.consommation === v).length, ce = v => rel.filter(r => r.etat === v).length;
      o.section('Suivi des postes');
      o.para(`${rel.length} poste(s) relevé(s) : ${c('TC')} totalement consommé(s) (TC), ${c('PC')} partiellement (PC), ${c('NC')} non consommé(s) (NC)${ce('casse') ? `, ${ce('casse')} cassé(s)` : ''}${ce('absent') ? `, ${ce('absent')} absent(s)` : ''}.`);
      const E = Object.fromEntries(ETATS_POSTE), COUL = { TC: [240, 138, 128], PC: [224, 166, 58], NC: [108, 194, 143] };
      o.table([{ t: 'N°', w: 8 }, { t: 'Emplacement', w: 40 }, { t: 'Conso.', w: 12 }, { t: 'État', w: 16 }, { t: 'Appât (n° AMM)', w: 38 }, { t: 'Commentaire', w: 30 }],
        postesRel.filter(po => relDe(po.id)).map(po => { const r = relDe(po.id); const rp = r.releves_produits?.[0];
          return [{ t: String(po.numero), bold: true }, [po.emplacement || po.nom, CATEGORIES_POSTE[po.categorie] !== 'Rongeurs' ? CATEGORIES_POSTE[po.categorie] : ''].filter(Boolean).join(' · '),
            r.consommation ? { t: r.consommation, bold: true, fill: COUL[r.consommation] } : '—', { t: E[r.etat] || '', color: ['casse', 'absent'].includes(r.etat) ? [179, 38, 30] : NOIR, bold: ['casse', 'absent'].includes(r.etat) },
            rp ? `${nomP(produit(rp.produit_id))}${rp.numero_amm ? ' (' + rp.numero_amm + ')' : ''}${rp.quantite ? ' · ' + rp.quantite + ' ' + (rp.unite || '') : ''}` : (r.type_appatage === 'non_toxique' ? 'Non toxique' : ''), r.commentaire || ''];
        }));
      // Plans avec les postes
      for (const pl of plans) {
        const im = await image('plans', pl.image_chemin, 1600);
        const ps = postes.filter(po => po.plan_id === pl.id && po.position_x != null);
        if (!im || !ps.length) continue;
        const w = o.cw, h = w * im.h / im.w, hh = Math.min(h, 150), ww = hh * im.w / im.h;
        o.place(hh + 10); o.txt('Plan : ' + pl.nom, M, o.y, { size: 9, bold: true }); o.y += 5;
        const x0 = M + (o.cw - ww) / 2; pdf.addImage(im.data, im.fmt, x0, o.y, ww, hh);
        ps.forEach(po => { const r = relDe(po.id), cx = x0 + po.position_x / 100 * ww, cy = o.y + po.position_y / 100 * hh;
          pdf.setFillColor(...(['casse', 'absent'].includes(r?.etat) ? [179, 38, 30] : po.categorie === 'insectes' ? [63, 155, 90] : po.categorie === 'controle' ? [59, 125, 216] : OR));
          pdf.setDrawColor(255, 255, 255); pdf.setLineWidth(0.5); pdf.circle(cx, cy, 2.6, 'FD');
          o.txt(String(po.numero), cx, cy - 1.4, { size: 6.5, bold: true, color: [255, 255, 255], align: 'center' }); });
        o.y += hh + 4;
      }
      // Historique (5 derniers passages)
      const dates = [...new Map(histo.map(x => [x.passage_id, x])).values()].sort((a, b) => new Date(a.date_passage) - new Date(b.date_passage)).slice(-6);
      if (dates.length > 1) {
        o.section('Historique des relevés');
        o.table([{ t: 'Poste', w: 30 }, ...dates.map(x => ({ t: fmtDate(x.date_passage).slice(0, 5) + '/' + fmtDate(x.date_passage).slice(8), w: 14 }))],
          postesRel.map(po => [`${po.numero} · ${po.emplacement || ''}`.slice(0, 40), ...dates.map(x => { const h = histo.find(y => y.poste_id === po.id && y.passage_id === x.passage_id);
            return h ? (h.consommation || (['casse', 'absent'].includes(h.etat) ? E[h.etat] : '—')) : ''; })]), { size: 7.5 });
      }
    }
  }

  // Photos
  const phs = d.photos.filter(ph => ph.dans_rapport);
  if (phs.length) {
    o.section('Photos');
    const w = (o.cw - 6) / 2; let col = 0, hrow = 0;
    for (const ph of phs) {
      const im = await image('photos', ph.chemin, 900);
      if (!im) continue;
      const h = Math.min(w * im.h / im.w, 85);
      if (col === 0) { o.place(h + 10); hrow = 0; }
      const iw = h * im.w / im.h, x = M + col * (w + 6) + (w - iw) / 2;
      pdf.addImage(im.data, 'JPEG', x, o.y, iw, h);
      o.txt(`${MOMENTS[ph.moment] || ''} · ${fmtDateTime(ph.prise_le)}${ph.legende ? ' · ' + ph.legende : ''}`, M + col * (w + 6), o.y + h + 1, { size: 7, color: GRIS, w });
      hrow = Math.max(hrow, h + 7);
      col = (col + 1) % 2; if (col === 0) o.y += hrow;
    }
    if (col === 1) o.y += hrow;
  }

  if (!avis) {
    if (p.recommandations) { o.section('Recommandations'); o.para(p.recommandations); }
    if (p.conclusion) { o.section('Conclusion'); o.para(p.conclusion); }
  }
  const suivant = autres.find(x => x.numero > p.numero && ['a_planifier', 'planifie'].includes(x.statut));
  if (suivant || p.a_prevoir_prochain) {
    o.section('Prochain passage');
    o.para([suivant && (suivant.debut_prevu ? `Prévu le ${fmtDateTime(suivant.debut_prevu)}` : suivant.date_cible ? `Prévu vers le ${fmtDate(suivant.date_cible)}` : 'À planifier'), p.a_prevoir_prochain].filter(Boolean).join('. '));
  }

  // Signatures
  const [sc, st] = await Promise.all([image('signatures', p.signature_client_chemin, 600, false), image('signatures', p.signature_technicien_chemin || moi.profil?.signature_chemin, 600, false)]);
  o.place(42); o.y += 4;
  const half = (o.cw - 8) / 2;
  [[avis ? null : 'Le client' + (p.signataire_nom ? ' : ' + p.signataire_nom : '') + (p.signataire_qualite ? ' (' + p.signataire_qualite + ')' : ''), sc, p.signe_le], ['Le technicien : ' + nomTech(p.technicien_id), st]].forEach(([t, im, dt], i) => {
    if (!t) return;
    const x = M + i * (half + 8);
    pdf.setDrawColor(...LIGNE); pdf.roundedRect(x, o.y, half, 34, 2, 2, 'S');
    o.txt(t, x + 3, o.y + 2.5, { size: 8, bold: true, w: half - 6 });
    if (im) { const h = 22, w2 = Math.min(half - 10, h * im.w / im.h); pdf.addImage(im.data, 'PNG', x + 5, o.y + 9, w2, w2 * im.h / im.w > h ? h : w2 * im.h / im.w); }
    if (dt) o.txt('Signé le ' + fmtDateTime(dt), x + 3, o.y + 30, { size: 6.8, color: GRIS });
  });
  o.y += 38;
  pieds(o);
  return pdf.output('blob');
}

// ---------- Fiche délai de rentrée : 2 exemplaires sur une page A4 paysage ----------
export async function pdfDelai(d, p) {
  await chargerJsPDF();
  const v = valeursDelai(d, p);
  const o = doc('l'), { pdf, W, H } = o, e = moi.entreprise || {};
  const [sc, st, logo] = await Promise.all([image('signatures', v.signature_client_chemin, 500, false), image('signatures', v.signature_tech_chemin, 500, false), image('entreprise', e.logo_chemin, 400, false)]);
  const urg = ref.modeles.delai_rentree_urgence?.contenu || 'Urgence : SAMU 15 - Centre antipoison (Marseille) 04 91 75 25 25 - Produits : FDS disponibles sur demande';
  const eng = ref.modeles.delai_rentree_engagement?.contenu || '';
  const cw = (W - 3 * 8) / 2;
  const coche = (x, y, on) => { pdf.setDrawColor(...NOIR); pdf.setLineWidth(0.25); pdf.rect(x, y, 2.6, 2.6); if (on) { pdf.setFillColor(...OR); pdf.rect(x + 0.5, y + 0.5, 1.6, 1.6, 'F'); } };
  const exemplaire = (x0, titre) => {
    let y = 8;
    const t = (s, x, yy, opt) => o.txt(s, x, yy, opt);
    t(titre, x0 + cw / 2, y, { size: 7, bold: true, color: GRIS, align: 'center' }); y += 5;
    if (logo) pdf.addImage(logo.data, logo.fmt, x0, y, 18 * logo.w / logo.h > 30 ? 30 : 18 * logo.w / logo.h, 18 * logo.w / logo.h > 30 ? 30 * logo.h / logo.w : 18);
    else { t('NUISIBLE', x0, y, { size: 11, bold: true, color: OR }); t('EXPRESS 34', x0, y + 4.5, { size: 9, bold: true }); }
    t("FICHE D'INTERVENTION", x0 + cw / 2 + 8, y, { size: 11, bold: true, align: 'center' });
    t('ET CONSIGNES DE SÉCURITÉ', x0 + cw / 2 + 8, y + 4.6, { size: 9, bold: true, align: 'center' });
    t((e.nom || '').toUpperCase(), x0 + cw / 2 + 8, y + 9.4, { size: 7, align: 'center' });
    t('Certibiocide N° ' + (e.numero_certibiocide || ''), x0 + cw / 2 + 8, y + 12.6, { size: 7, color: GRIS, align: 'center' }); y += 19;
    t(`Date : ${fmtDate(v.date)}     Heure d'intervention : ${v.heure || ''}     Facture / devis n° : ${v.facture_devis || ''}`, x0, y, { size: 8 }); y += 6;
    const titreS = (n, s) => { pdf.setFillColor(...OR); pdf.circle(x0 + 2.2, y + 1.8, 2.2, 'F'); t(n, x0 + 2.2, y + 0.4, { size: 7, bold: true, color: [255, 255, 255], align: 'center' }); t(s, x0 + 6, y, { size: 8.5, bold: true }); y += 6; };
    const ligne = (k, val, w = cw) => { const h = o.hauteur(val, w - 32, 8); t(k, x0, y, { size: 8, bold: true }); t(val, x0 + 30, y, { size: 8, w: w - 32 }); y += Math.max(4.4, h + 1); };
    titreS('1', 'INFORMATIONS CLIENT'); ligne('Nom / Enseigne :', v.nom); ligne('Adresse :', v.adresse); ligne('Téléphone :', `${v.telephone || ''}     Contact sur place : ${v.contact || ''}`); y += 2;
    titreS('2', 'DÉTAILS DU TRAITEMENT (3D)');
    t('Type de prestation :', x0, y, { size: 8, bold: true }); y += 4.5;
    ['Désinsectisation', 'Dératisation', 'Désinfection', 'Autre'].forEach((s, i) => { coche(x0 + 2 + i * 31, y, v.type_prestation === s); t(s, x0 + 6 + i * 31, y, { size: 7.5 }); }); y += 5.5;
    ligne('Nuisible(s) ciblé(s) :', v.nuisibles); ligne('Zones traitées :', v.zones); ligne('Produit(s) utilisé(s) :', v.produits);
    t("Mode d'application :", x0, y, { size: 8, bold: true }); y += 4.5;
    ['Pulvérisation', 'Nébulisation', 'Pose de gel / appâts', 'Poudrage'].forEach((s, i) => { coche(x0 + 2 + i * 31, y, (v.modes || []).includes(s)); t(s, x0 + 6 + i * 31, y, { size: 7.5 }); }); y += 7;
    titreS('3', 'CONSIGNES DE SÉCURITÉ OBLIGATOIRES');
    pdf.setDrawColor(...OR); pdf.setLineWidth(0.6); const yb = y; y += 2;
    t('DÉLAI DE RENTRÉE :', x0 + 3, y, { size: 8, bold: true }); t(`Ne pas pénétrer dans les zones traitées avant ${v.delai_heures || '____'} heures`, x0 + 36, y, { size: 8 }); y += 4.5;
    t(`(heure de retour autorisée : ${v.heure_retour || heureRetour(v.heure, v.delai_heures) || '____ h ____'})`, x0 + 36, y, { size: 8, bold: true, color: OR }); y += 5.5;
    t(`AÉRATION : À votre retour, aérer obligatoirement les pièces pendant ${v.aeration_min || '____'} minutes.`, x0 + 3, y, { size: 8, bold: true }); y += 5.5;
    t('PRÉCAUTIONS :', x0 + 3, y, { size: 8, bold: true }); y += 4.5;
    const prec = ['Ne pas laver les sols avant 48 h', 'Hors de portée enfants / animaux', 'Ne pas toucher / déplacer les appâts', 'Protéger aliments / vaisselle'];
    prec.forEach((s, i) => { const xx = x0 + 5 + (i % 2) * (cw / 2), yy = y + Math.floor(i / 2) * 4.5; coche(xx, yy, (v.precautions || []).includes(s)); t(s, xx + 4, yy, { size: 7.5 }); }); y += 9.5;
    coche(x0 + 5, y, !!v.autre); t('Autre : ' + (v.autre || ''), x0 + 9, y, { size: 7.5, w: cw - 14 }); y += 5;
    pdf.roundedRect(x0, yb - 1, cw, y - yb + 1, 1.5, 1.5, 'S');
    y += 1.5; t(urg, x0, y, { size: 7, bold: true, color: [179, 38, 30], w: cw }); y += o.hauteur(urg, cw, 7) + 3;
    titreS('4', 'SIGNATURES'); const he = o.hauteur(eng, cw, 7); t(eng, x0, y, { size: 7, w: cw }); y += he + 2;
    const sw = (cw - 6) / 2;
    [[`Le client (nom, « lu et approuvé ») : ${v.signataire || ''}`, sc], ['Le technicien', st]].forEach(([s, im], i) => {
      const x = x0 + i * (sw + 6); pdf.setDrawColor(...LIGNE); pdf.setLineWidth(0.3); pdf.roundedRect(x, y, sw, 26, 1.5, 1.5, 'S');
      t(s, x + 2, y + 1.5, { size: 7, bold: true, w: sw - 4 });
      if (im) { const hh = 15, ww = Math.min(sw - 6, hh * im.w / im.h); pdf.addImage(im.data, 'PNG', x + 3, y + 8, ww, ww * im.h / im.w); }
    });
    y += 29;
    t([e.nom, adresseDe(e)].filter(Boolean).join(' - '), x0 + cw / 2, H - 13, { size: 6.5, color: GRIS, align: 'center', w: cw });
    t([e.telephone, e.email, e.siret && 'SIRET ' + e.siret].filter(Boolean).join(' - '), x0 + cw / 2, H - 9.5, { size: 6.5, color: GRIS, align: 'center', w: cw });
  };
  exemplaire(8, 'EXEMPLAIRE CLIENT');
  pdf.setDrawColor(...GRIS); pdf.setLineDashPattern([1.5, 1.5], 0); pdf.line(W / 2, 6, W / 2, H - 6); pdf.setLineDashPattern([], 0);
  exemplaire(W / 2 + 4, 'EXEMPLAIRE ' + (e.nom ? e.nom.split(' - ')[0].toUpperCase() : 'ENTREPRISE'));
  return pdf.output('blob');
}

// ---------- Registre des biocides (contrôle) ----------
export async function pdfRegistre(lignes, du, au) {
  await chargerJsPDF();
  const o = doc('l');
  await entete(o, 'REGISTRE DES PRODUITS BIOCIDES', `du ${fmtDate(du)} au ${fmtDate(au)}`);
  o.table([{ t: 'Date', w: 16 }, { t: 'Dossier', w: 16 }, { t: 'Client', w: 34 }, { t: 'Adresse', w: 40 }, { t: 'Produit', w: 34 }, { t: 'N° AMM', w: 22 }, { t: 'Type', w: 18 }, { t: 'Lot', w: 14 }, { t: 'Quantité', w: 14 }, { t: 'Usage', w: 18 }],
    lignes.map(l => [fmtDate(l.date_utilisation), l.reference || '', l.client || '', [l.adresse, l.ville].filter(Boolean).join(', '), l.produit || '', l.numero_amm || '', l.type_biocide || '', l.numero_lot || '', l.quantite != null ? `${l.quantite} ${l.unite || ''}` : '', l.methode || '']), { size: 7.5 });
  pieds(o);
  return o.pdf.output('blob');
}
