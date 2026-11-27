// Écran « Aujourd'hui »
import { html, useState, Icon, Titre, Presta, Statut, Chargement, Vide, useCharge, erreur, toast } from '../ui.js';
import { sb, run, moi, lire, modifier } from '../db.js';
import { passagesPeriode, materiel, valeursTexte, texteType, lendemain, aVenir, lireFiltreTech, filtrerTech } from '../data.js';
import { FiltreTech } from './planning.js';
import { nomTech, ref, estAdmin } from '../db.js';
import { fmtTime, fmtDateLong, fmtDate, addDays, mailHref, smsHref, today, dayKey, JOURS } from '../util.js';

export function Accueil() {
  const [data, recharger] = useCharge(async () => {
    const d0 = new Date(); d0.setHours(0, 0, 0, 0);
    const [jour, demain, venir] = await Promise.all([passagesPeriode(d0, addDays(d0, 1)), passagesPeriode(...lendemain()), aVenir(60)]);
    const [tb, rappels] = await Promise.all([
      lire('tdb', () => run(sb.from('v_tableau_de_bord').select('*'))).catch(() => []),
      lire('rappels', () => run(sb.from('rappels').select('*').is('fait_le', null).lte('echeance', dayKey(addDays(new Date(), 7))).order('echeance').limit(30))).catch(() => []),
    ]);
    return { jour, demain, venir, tb: tb[0] || {}, rappels };
  });
  const [qui, setQui] = useState(lireFiltreTech());
  if (!data) return html`<${Chargement} />`;
  const { tb, rappels } = data;
  const jour = filtrerTech(data.jour, qui), demain = filtrerTech(data.demain, qui), venir = filtrerTech(data.venir, qui);
  const sem = venir.filter(p => new Date(p.debut_prevu) < addDays(new Date(), 7)).length;
  const prenom = moi.profil?.prenom || '';
  const mat = jour.flatMap(p => materiel(p).map(m => `${m} (${p.client})`));
  const aConfirmer = demain.filter(p => !p.extra.confirmation_envoyee_le && ['planifie'].includes(p.statut));

  const confirmer = async (p, canal) => {
    const v = valeursTexte(p);
    if (canal === 'email') {
      const { data: c } = await sb.from('clients').select('email,emails_copie').eq('id', p.client_id).single();
      const t = texteType('email_confirmation', v);
      location.href = mailHref(c?.email || '', t.objet, t.contenu);
    } else {
      const t = texteType('sms_confirmation', v);
      location.href = smsHref(p.telephone, t.contenu);
    }
    try {
      await modifier('passages', p.passage_id, { confirmation_envoyee_le: new Date().toISOString(), confirmation_canal: canal, sms_rappel_fait: canal === 'sms' });
      await sb.from('rappels').update({ fait_le: new Date().toISOString() }).eq('passage_id', p.passage_id).eq('type', 'sms_a_envoyer');
      setTimeout(recharger, 800);
    } catch (e) { erreur(e); }
  };
  const faitRappel = async r => { try { await modifier('rappels', r.id, { fait_le: new Date().toISOString() }); toast('Rappel marqué comme fait'); recharger(); } catch (e) { erreur(e); } };
  const lienRappel = r => r.passage_id ? '#/intervention/' + r.passage_id : r.contrat_id ? '#/contrat/' + r.contrat_id : r.type === 'certibiocide' ? '#/reglages' : null;

  return html`
    <${Titre} sur=${html`<i>●</i> ${fmtDateLong(new Date())}`} em=${prenom ? prenom + ' !' : ''}>Bonjour${prenom ? '' : ' !'}<//>
    <${FiltreTech} valeur=${qui} onChange=${setQui} />
    ${mat.length > 0 && html`<div class="band"><div class="t">À prendre ce matin</div><ul>${mat.map(m => html`<li>${m}</li>`)}</ul></div>`}
    <div class="stats">
      <a class="stat" href="#/planning"><b>${jour.length}</b><span>Intervention(s) aujourd'hui</span></a>
      <a class="stat" href="#/planning?vue=mois"><b>${venir.length}</b><span>À venir (${sem} cette semaine)</span></a>
      <a class="stat" href="#/rapports"><b>${tb.rapports_non_envoyes ?? 0}</b><span>Rapport(s) à envoyer</span></a>
      <a class="stat" href="#/planning?vue=aplanifier"><b>${tb.passages_a_planifier ?? 0}</b><span>Passage(s) à planifier</span></a>
      <a class="stat" href="#/contrats"><b>${(tb.contrats_a_renouveler ?? 0) + (tb.bilans_j35_en_retard ?? 0)}</b><span>Contrat(s) / bilan(s) J+35 en attente</span></a>
    </div>
    <div class="grid2">
      <div class="card">
        <div class="ch"><h3>Aujourd'hui</h3><a class="link" href="#/planning">Tout le planning</a></div>
        ${jour.length === 0 ? html`<${Vide}>Aucune intervention prévue aujourd'hui.<br /><a class="btn pri sm" style="margin-top:12px" href="#/nouvelle"><${Icon} n="plus" />Nouvelle intervention</a><//>`
          : jour.map(p => html`<a class="rdv" href=${'#/intervention/' + p.passage_id} style=${`--c:${p.couleur}`}>
            <div class="h">${fmtTime(p.debut_prevu)}</div>
            <div><div class="pres" style=${`color:${p.couleur}`}><span class="dot" style=${`background:${p.couleur}`}></span>${p.prestation} · ${p.nature || 'passage ' + p.numero + '/' + p.nb_passages}</div>
              <div class="who">${p.client}</div><div class="where">${[p.adresse, p.ville].filter(Boolean).join(', ')}${p.payeur && p.payeur !== p.client ? ' · ' + p.payeur : ''}</div>
              ${materiel(p).length > 0 && html`<div class="small" style="margin-top:3px;color:var(--orange-deep)"><${Icon} n="box" /> ${materiel(p).join(' · ')}</div>`}</div>
            <div><${Statut} s=${p.statut} /></div></a>`)}
      </div>
      <div class="stack">
        <div class="card"><div class="ch"><h3>À venir</h3><a class="link" href="#/planning?vue=mois">Voir le mois</a></div>
          ${venir.length === 0 ? html`<${Vide}>Aucune intervention prévue dans les 2 prochains mois.<//>`
            : venir.slice(0, 8).map(p => html`<a class="rdv" href=${'#/intervention/' + p.passage_id} style=${`--c:${p.couleur}`}>
              <div class="h" style="font-size:.85rem;line-height:1.15">${JOURS[new Date(p.debut_prevu).getDay()]} ${fmtDate(p.debut_prevu).slice(0, 5)}<br /><span class="small muted">${fmtTime(p.debut_prevu)}</span></div>
              <div><div class="pres" style=${`color:${p.couleur}`}><span class="dot" style=${`background:${p.couleur}`}></span>${p.prestation}</div>
                <div class="who">${p.client}</div><div class="where">${p.ville || ''}${estAdmin() && ref.profils.length > 1 && p.technicien_id ? ' · ' + nomTech(p.technicien_id) : ''}</div></div>
              <div><${Statut} s=${p.statut} /></div></a>`)}
          ${venir.length > 8 && html`<a class="btn sm ghost" style="margin-top:10px" href="#/planning?vue=mois">Voir les ${venir.length - 8} autres</a>`}
        </div>
        ${aConfirmer.length > 0 && html`<div class="card"><div class="ch"><h3>Confirmer demain</h3><span class="pill or">${aConfirmer.length}</span></div>
          ${aConfirmer.map(p => html`<div class="rem"><div class="ico"><${Icon} n=${p.canal_confirmation === 'sms' ? 'sms' : 'mail'} /></div><div>
            <p><b>${p.client}</b> · ${fmtTime(p.debut_prevu)}<br /><span class="muted">${p.prestation}</span></p>
            <div class="acts"><button class=${'btn sm ' + (p.canal_confirmation === 'email' ? 'pri' : '')} onClick=${() => confirmer(p, 'email')}><${Icon} n="mail" />E-mail</button>
              <button class=${'btn sm ' + (p.canal_confirmation === 'sms' ? 'pri' : '')} onClick=${() => confirmer(p, 'sms')} disabled=${!p.telephone}><${Icon} n="sms" />SMS</button></div></div></div>`)}
        </div>`}
        <div class="card"><div class="ch"><h3>Rappels</h3></div>
          ${rappels.length === 0 ? html`<${Vide}>Aucun rappel pour les 7 prochains jours.<//>`
            : rappels.map(r => html`<div class="rem"><div class="ico"><${Icon} n="bell" /></div><div style="flex:1">
              <p><b>${r.titre}</b><br /><span class=${r.echeance < today() ? 'pill bad' : 'muted small'}>${r.echeance < today() ? 'En retard · ' : ''}${fmtDate(r.echeance)}</span></p>
              <div class="acts">${lienRappel(r) && html`<a class="btn sm" href=${lienRappel(r)}>Ouvrir</a>`}<button class="btn sm ghost" onClick=${() => faitRappel(r)}><${Icon} n="check" />Fait</button></div></div></div>`)}
        </div>
        <a class="btn ghost" href="#/nouvelle?direct=1"><${Icon} n="live" />Intervention en direct (sur place)</a>
      </div>
    </div>`;
}
