// Planning : semaine (ordinateur), jour par jour (téléphone), passages à planifier
import { html, useState, Icon, Titre, Statut, Chargement, Vide, useCharge, Modal, ouvrir, Texte, erreur, toast, aller } from '../ui.js';
import { sb, run, ref, moi, modifier, estAdmin, nomTech } from '../db.js';
import { passagesPeriode, aPlanifier, materiel, lireFiltreTech, ecrireFiltreTech, filtrerTech } from '../data.js';
import { fmtTime, fmtDate, addDays, startOfWeek, dayKey, JOURS, MOIS, today, isoFrom, timeKey, cls, mapsHref } from '../util.js';

const H0 = 7, H1 = 20, HH = 48;

export function Planning({ q }) {
  const [debut, setDebut] = useState(startOfWeek(q.d || new Date()));
  const [jourSel, setJourSel] = useState(q.d || today());
  const [vue, setVue] = useState(q.vue || 'semaine');
  const [qui, setQui] = useState(lireFiltreTech());
  const fin = addDays(debut, 7);
  const [evsT, recharger] = useCharge(() => passagesPeriode(debut, fin), [debut.getTime()]);
  const [aplanT, rechargerAP] = useCharge(() => aPlanifier(), []);
  const evs = evsT && filtrerTech(evsT, qui), aplan = aplanT && filtrerTech(aplanT, qui);

  const jours = [...Array(7)].map((_, i) => addDays(debut, i));
  const avecDim = (evs || []).some(e => new Date(e.debut_prevu).getDay() === 0);
  const jv = avecDim ? jours : jours.slice(0, 6);
  const parJour = k => (evs || []).filter(e => dayKey(e.debut_prevu) === k);
  const semaine = d => { setDebut(startOfWeek(d)); setJourSel(dayKey(d)); };
  const titreSem = `${jours[0].getDate()} ${MOIS[jours[0].getMonth()].slice(0, 4)}. – ${jours[6].getDate()} ${MOIS[jours[6].getMonth()]} ${jours[6].getFullYear()}`;

  const planifier = async p => {
    const ok = await ouvrir(FenetrePlanifier, { p });
    if (ok) { recharger(); rechargerAP(); }
  };
  const itineraire = k => {
    const l = parJour(k).map(e => [e.adresse, e.code_postal, e.ville].filter(Boolean).join(' ')).filter(Boolean);
    if (!l.length) return toast('Aucune adresse ce jour-là');
    window.open('https://www.google.com/maps/dir/' + ['Ma+position', ...l].map(encodeURIComponent).join('/'), '_blank');
  };

  return html`
    <${Titre} sur="Planning" em=${vue === 'aplanifier' ? 'à planifier' : ''} actions=${html`
      <div class="chips"><button aria-pressed=${vue === 'semaine'} onClick=${() => setVue('semaine')}>Semaine</button>
        <button aria-pressed=${vue === 'mois'} onClick=${() => setVue('mois')}>Mois</button>
        <button aria-pressed=${vue === 'aplanifier'} onClick=${() => setVue('aplanifier')}>À planifier${aplan?.length ? ` (${aplan.length})` : ''}</button></div>
      <a class="btn pri hide-m" href="#/nouvelle"><${Icon} n="plus" />Nouvelle intervention</a>`}>${vue === 'aplanifier' ? 'Passages' : vue === 'mois' ? 'Mon mois' : 'Ma semaine'}<//>
    <${FiltreTech} valeur=${qui} onChange=${setQui} />

    ${vue === 'mois' ? html`<${VueMois} qui=${qui} jour0=${jourSel} />` : vue === 'aplanifier' ? html`<div class="card">
      ${!aplan ? html`<${Chargement} />` : aplan.length === 0 ? html`<${Vide}>Tout est planifié. 👍<//>` :
        html`<div class="tblwrap"><table class="tbl resp"><thead><tr><th>Date visée</th><th>Client</th><th class="hm">Prestation</th><th></th></tr></thead><tbody>
        ${aplan.map(p => html`<tr>
          <td><b>${p.date_cible ? fmtDate(p.date_cible) : 'Sans date'}</b>${p.date_cible && p.date_cible < today() ? html` <span class="pill bad">en retard</span>` : ''}<div class="small muted">${p.reference} · passage ${p.numero}</div></td>
          <td><a href=${'#/intervention/' + p.passage_id} style="color:inherit"><b>${p.client}</b></a><div class="small muted">${p.ville || ''}</div></td>
          <td class="hm"><span class="dot" style=${`background:${p.couleur}`}></span> ${p.prestation}</td>
          <td style="text-align:right"><button class="btn sm pri" onClick=${() => planifier(p)}><${Icon} n="cal" />Planifier</button></td></tr>`)}
        </tbody></table></div>`}</div>`
    : html`
      <div class="row between">
        <div class="row"><button class="iconbtn" onClick=${() => semaine(addDays(debut, -7))} aria-label="Semaine précédente"><${Icon} n="back" /></button>
          <button class="btn sm ghost" onClick=${() => semaine(new Date())}>Aujourd'hui</button>
          <button class="iconbtn" onClick=${() => semaine(addDays(debut, 7))} aria-label="Semaine suivante"><${Icon} n="next" /></button>
          <b class="small">${titreSem}</b></div>
        <div class="legend hide-m">${ref.prestations.map(p => html`<span><i class="dot" style=${`background:${p.couleur}`}></i>${p.nom.replace(/ \(.*\)/, '')}</span>`)}</div>
      </div>
      ${!evs ? html`<${Chargement} />` : html`
      <div class="cal" style=${`--nd:${jv.length};--hh:${HH}px`}>
        <div class="cal-h"><div></div>${jv.map(d => html`<div class=${dayKey(d) === today() ? 'today' : ''}>${JOURS[d.getDay()]}<b>${d.getDate()}</b>
          ${parJour(dayKey(d)).length > 1 && html`<button class="link small" onClick=${() => itineraire(dayKey(d))}>Itinéraire</button>`}</div>`)}</div>
        <div class="cal-b" style=${`height:${(H1 - H0) * HH}px`}>
          <div class="cal-hours">${[...Array(H1 - H0)].map((_, i) => i > 0 && html`<span style=${`top:${i * HH}px`}>${H0 + i}h</span>`)}</div>
          ${jv.map(d => html`<div class=${cls('cal-col', dayKey(d) === today() && 'today')} onDblClick=${() => aller('nouvelle?jour=' + dayKey(d))}>
            ${parJour(dayKey(d)).map(e => {
              const s = new Date(e.debut_prevu), f = e.fin_prevue ? new Date(e.fin_prevue) : new Date(s.getTime() + 3600000);
              const top = Math.max(0, (s.getHours() + s.getMinutes() / 60 - H0) * HH), hgt = Math.max(30, (f - s) / 3600000 * HH - 2);
              const m = materiel(e);
              return html`<a class=${cls('ev', ['fait', 'rapport_envoye', 'facture'].includes(e.statut) && 'done')} href=${'#/intervention/' + e.passage_id} style=${`--c:${e.couleur};top:${top}px;height:${hgt}px`}
                title=${`${fmtTime(s)} ${e.client} — ${e.prestation}`}><b>${fmtTime(s)} ${e.client}</b>${e.ville || ''}${m.length > 0 && html`<span class="mat">${m[0]}</span>`}</a>`;
            })}</div>`)}
        </div>
      </div>
      <div class="daystrip">${jours.map(d => html`<button aria-pressed=${dayKey(d) === jourSel} onClick=${() => setJourSel(dayKey(d))}>
        ${JOURS[d.getDay()]}<b style=${dayKey(d) === today() && dayKey(d) !== jourSel ? 'color:var(--orange)' : ''}>${d.getDate()}</b>
        <span class="dots">${parJour(dayKey(d)).slice(0, 4).map(e => html`<i style=${`background:${e.couleur}`}></i>`)}</span></button>`)}</div>
      <div class="daylist">
        ${parJour(jourSel).length === 0 ? html`<div class="card"><${Vide}>Rien de prévu ce jour-là.<//></div>` : html`
          ${parJour(jourSel).length > 1 && html`<button class="btn ghost sm" onClick=${() => itineraire(jourSel)}><${Icon} n="pin" />Itinéraire de la journée</button>`}
          ${parJour(jourSel).map(e => html`<a class="card rdv" style=${`border-left:4px solid ${e.couleur};grid-template-columns:56px 1fr`} href=${'#/intervention/' + e.passage_id}>
            <div class="h">${fmtTime(e.debut_prevu)}</div>
            <div><div class="pres" style=${`color:${e.couleur}`}>${e.prestation}</div><div class="who">${e.client}</div>
              <div class="where">${[e.adresse, e.ville].filter(Boolean).join(', ')}</div>
              ${materiel(e).length > 0 && html`<div class="small" style="color:var(--orange-deep);margin-top:4px"><${Icon} n="box" /> ${materiel(e).join(' · ')}</div>`}
              <div style="margin-top:6px"><${Statut} s=${e.statut} /></div></div></a>`)}`}
        <a class="btn pri" href=${'#/nouvelle?jour=' + jourSel}><${Icon} n="plus" />Ajouter ce jour-là</a>
      </div>`}`}`;
}

export function FenetrePlanifier({ p, fermer }) {
  const d0 = p.debut_prevu ? new Date(p.debut_prevu) : null;
  const [jour, setJour] = useState(d0 ? dayKey(d0) : (p.date_cible || today()));
  const [heure, setHeure] = useState(d0 ? timeKey(d0) : '09:00');
  const [duree, setDuree] = useState(p.debut_prevu && p.fin_prevue ? Math.round((new Date(p.fin_prevue) - d0) / 60000) : 60);
  const go = async () => {
    try {
      const debut = isoFrom(jour, heure);
      await modifier('passages', p.passage_id || p.id, { debut_prevu: debut, fin_prevue: new Date(new Date(debut).getTime() + duree * 60000).toISOString(), ...(p.statut === 'a_repasser' || p.statut === 'a_planifier' ? { statut: 'planifie' } : {}) });
      toast('Rendez-vous enregistré'); fermer(true);
    } catch (e) { erreur(e); }
  };
  return html`<${Modal} titre="Planifier le passage" onClose=${() => fermer(false)} pied=${html`<button class="btn ghost" onClick=${() => fermer(false)}>Annuler</button><button class="btn pri" onClick=${go}>Enregistrer</button>`}>
    ${p.client && html`<p style="margin:0"><b>${p.client}</b> · ${p.prestation || ''}</p>`}
    <div class="form">
      <${Texte} label="Jour" type="date" value=${jour} onInput=${setJour} />
      <${Texte} label="Heure" type="time" value=${heure} onInput=${setHeure} />
      <${Texte} label="Durée prévue (minutes)" type="number" min="15" step="15" value=${duree} onInput=${v => setDuree(+v || 60)} />
    </div><//>`;
}

// Filtre par personne (administrateur, s'il y a plusieurs comptes)
export function FiltreTech({ valeur, onChange }) {
  const pf = ref.profils.filter(p => p.actif !== false);
  if (!estAdmin() || pf.length < 2) return null;
  const opts = [['tous', 'Tout le monde'], ['moi', 'Moi'], ...pf.filter(p => p.id !== moi.profil?.id).map(p => [p.id, nomTech(p.id)])];
  return html`<div class="chips" style="margin:-4px 0 14px">${opts.map(([v, l]) => html`<button aria-pressed=${valeur === v} onClick=${() => { ecrireFiltreTech(v); onChange(v); }}>${l}</button>`)}</div>`;
}

// Carte d'un rendez-vous (liste du jour)
const CarteRdv = ({ e }) => html`<a class="card rdv" style=${`border-left:4px solid ${e.couleur};grid-template-columns:56px 1fr`} href=${'#/intervention/' + e.passage_id}>
  <div class="h">${fmtTime(e.debut_prevu)}</div>
  <div><div class="pres" style=${`color:${e.couleur}`}>${e.prestation}</div><div class="who">${e.client}</div>
    <div class="where">${[e.adresse, e.ville].filter(Boolean).join(', ')}</div>
    ${materiel(e).length > 0 && html`<div class="small" style="color:var(--orange-deep);margin-top:4px"><${Icon} n="box" /> ${materiel(e).join(' · ')}</div>`}
    <div style="margin-top:6px"><${Statut} s=${e.statut} />${estAdmin() && ref.profils.length > 1 && e.technicien_id ? html` <span class="small muted">${nomTech(e.technicien_id)}</span>` : ''}</div></div></a>`;

// Vue du mois entier : une pastille par intervention, touche un jour pour voir la liste
function VueMois({ qui, jour0 }) {
  const [mois, setMois] = useState(() => { const d = new Date(jour0 || new Date()); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [sel, setSel] = useState(jour0 || today());
  const deb = startOfWeek(mois), finM = new Date(mois.getFullYear(), mois.getMonth() + 1, 1);
  const nbSem = Math.ceil((addDays(finM, -1) - deb) / 864e5 / 7 + 0.01);
  const [evsT] = useCharge(() => passagesPeriode(deb, addDays(deb, nbSem * 7)), [deb.getTime()]);
  const evs = evsT && filtrerTech(evsT, qui);
  const parJour = k => (evs || []).filter(e => dayKey(e.debut_prevu) === k);
  const aller2 = n => { const m = new Date(mois.getFullYear(), mois.getMonth() + n, 1); setMois(m); setSel(dayKey(m.getMonth() === new Date().getMonth() && m.getFullYear() === new Date().getFullYear() ? new Date() : m)); };
  const jours = [...Array(nbSem * 7)].map((_, i) => addDays(deb, i));
  const duMois = (evs || []).filter(e => new Date(e.debut_prevu).getMonth() === mois.getMonth());
  return html`
    <div class="row between" style="margin-bottom:12px">
      <div class="row"><button class="iconbtn" onClick=${() => aller2(-1)} aria-label="Mois précédent"><${Icon} n="back" /></button>
        <button class="btn sm ghost" onClick=${() => { const t = new Date(); setMois(new Date(t.getFullYear(), t.getMonth(), 1)); setSel(today()); }}>Ce mois-ci</button>
        <button class="iconbtn" onClick=${() => aller2(1)} aria-label="Mois suivant"><${Icon} n="next" /></button>
        <b>${MOIS[mois.getMonth()]} ${mois.getFullYear()}</b></div>
      ${evs && html`<span class="pill or">${duMois.length} intervention(s)</span>`}
    </div>
    ${!evs ? html`<${Chargement} />` : html`
    <div class="mois card">
      ${['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(j => html`<div class="mh">${j}</div>`)}
      ${jours.map(d => { const k = dayKey(d), l = parJour(k); return html`<button class=${cls('mj', d.getMonth() !== mois.getMonth() && 'hors', k === today() && 'auj', k === sel && 'sel')} onClick=${() => setSel(k)} onDblClick=${() => aller('nouvelle?jour=' + k)}>
        <b>${d.getDate()}</b>
        <span class="dots">${l.slice(0, 4).map(e => html`<i style=${`background:${e.couleur}`}></i>`)}${l.length > 4 ? html`<em>+${l.length - 4}</em>` : ''}</span>
        <span class="lbl">${l.slice(0, 3).map(e => html`<span style=${`--c:${e.couleur}`}>${fmtTime(e.debut_prevu)} ${e.client}</span>`)}${l.length > 3 ? html`<span>+${l.length - 3} autre(s)</span>` : ''}</span>
      </button>`; })}
    </div>
    <h3 style="margin:18px 0 10px">${fmtDate(sel)}</h3>
    <div class="stack">${parJour(sel).length === 0 ? html`<div class="card"><${Vide}>Rien de prévu ce jour-là.<//></div>` : parJour(sel).map(e => html`<${CarteRdv} e=${e} />`)}
      <a class="btn pri" href=${'#/nouvelle?jour=' + sel}><${Icon} n="plus" />Ajouter ce jour-là</a></div>`}`;
}
