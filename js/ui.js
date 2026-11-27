// Composants d'écran communs
import { h, render } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import htm from './vendor/htm.js';
import { cls, STATUTS } from './util.js';
import { prestation, onRef } from './db.js';

export const html = htm.bind(h);
export const aller = x => { location.hash = x.startsWith('#') ? x : '#/' + x; };
export { h, render, useState, useEffect, useRef, useCallback };

const ICONS = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.6c2.4.2 4.3 1.9 5 5.4"/>',
  flask: '<path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/><path d="M7.5 14h9"/>',
  doc: '<path d="M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5M8.5 13h7M8.5 17h5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6l8.5 7 8.5-7"/>',
  sms: '<path d="M4 5h16v11H9l-5 4z"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  pen: '<path d="M4 20l4-1 11-11-3-3L5 16z"/>',
  send: '<path d="M3 11l18-8-8 18-2-8z"/>',
  cam: '<path d="M4 7h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13" r="3.5"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
  clip: '<path d="M20 11l-8 8a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7-7"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  contract: '<path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  dl: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
  up: '<path d="M12 21V9M7 14l5-5 5 5M4 4h16"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  live: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  out: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>',
};
export const Icon = ({ n, sw = 1.8 }) => html`<svg viewBox="0 0 24 24" width="1.15em" height="1.15em" style="vertical-align:-0.2em;flex:none" fill="none" stroke="currentColor" stroke-width=${sw} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: ICONS[n] || '' }}></svg>`;

// ---------- Messages et fenêtres ----------
let toastEl;
export function toast(msg, bad) {
  toastEl ||= Object.assign(document.createElement('div'), { id: 'toasts' });
  if (!toastEl.isConnected) document.body.appendChild(toastEl);
  render(html`<div class=${cls('toast', bad && 'bad')} role="status">${msg}</div>`, toastEl);
  clearTimeout(toast.t); toast.t = setTimeout(() => render(null, toastEl), bad ? 5000 : 2800);
}
export const erreur = e => { console.error(e); toast(e?.message || String(e), true); };

export function Modal({ titre, onClose, children, pied, large }) {
  useEffect(() => {
    const k = e => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', k); document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, []);
  return html`<div class="modal-bg" onClick=${e => e.target === e.currentTarget && onClose?.()}>
    <div class=${cls('modal', large && 'wide')} role="dialog" aria-modal="true" aria-label=${titre}>
      <div class="mh"><h2>${titre}</h2><button class="iconbtn" onClick=${onClose} aria-label="Fermer"><${Icon} n="x" /></button></div>
      <div class="mb">${children}</div>
      ${pied && html`<div class="mf">${pied}</div>`}
    </div></div>`;
}

// Fenêtre ouverte « par programme » : const ok = await ouvrir(Composant, props)
let modalEl;
export function ouvrir(Comp, props = {}) {
  modalEl ||= document.createElement('div');
  if (!modalEl.isConnected) document.body.appendChild(modalEl);
  return new Promise(res => {
    const fermer = v => { render(null, modalEl); res(v); };
    render(html`<${Comp} ...${props} fermer=${fermer} />`, modalEl);
  });
}
export const confirmer = (message, { titre = 'Confirmer', oui = 'Oui', danger } = {}) => ouvrir(({ fermer }) => html`
  <${Modal} titre=${titre} onClose=${() => fermer(false)} pied=${html`
    <button class="btn ghost" onClick=${() => fermer(false)}>Annuler</button>
    <button class=${cls('btn', danger ? 'danger' : 'pri')} onClick=${() => fermer(true)}>${oui}</button>`}>
    <p style="margin:0">${message}</p>
  <//>`);
export const demander = (message, { titre = 'Saisir', valeur = '', oui = 'Valider' } = {}) => ouvrir(({ fermer }) => {
  const [v, setV] = useState(valeur);
  return html`<${Modal} titre=${titre} onClose=${() => fermer(null)} pied=${html`
    <button class="btn ghost" onClick=${() => fermer(null)}>Annuler</button>
    <button class="btn pri" onClick=${() => fermer(v)}>${oui}</button>`}>
    <label class="fl">${message}</label>
    <input class="inp" value=${v} onInput=${e => setV(e.target.value)} onKeyDown=${e => e.key === 'Enter' && fermer(v)} autofocus />
  <//>`;
});

// ---------- Champs ----------
export const Champ = ({ label, children, full, hint }) => html`<div class=${cls('field', full && 'full')}>${label && html`<label class="fl">${label}</label>`}${children}${hint && html`<div class="hint">${hint}</div>`}</div>`;

export function Texte({ label, value, onInput, full, type = 'text', placeholder, hint, rows, ...rest }) {
  const inp = rows
    ? html`<textarea class="inp" rows=${rows} value=${value ?? ''} placeholder=${placeholder} onInput=${e => onInput(e.target.value)} ...${rest}></textarea>`
    : html`<input class="inp" type=${type} value=${value ?? ''} placeholder=${placeholder} onInput=${e => onInput(e.target.value)} ...${rest} />`;
  return label ? html`<${Champ} label=${label} full=${full} hint=${hint}>${inp}<//>` : inp;
}
export function Choix({ label, value, onChange, options, full, vide = '—', hint, ...rest }) {
  const opts = options.map(o => (Array.isArray(o) ? o : [o, o]));
  const sel = html`<select class="inp" value=${value ?? ''} onChange=${e => onChange(e.target.value || null)} ...${rest}>
    ${vide !== false && html`<option value="">${vide}</option>`}
    ${opts.map(([v, l]) => html`<option value=${v} selected=${String(v) === String(value ?? '')}>${l}</option>`)}
  </select>`;
  return label ? html`<${Champ} label=${label} full=${full} hint=${hint}>${sel}<//>` : sel;
}
// Liste avec saisie libre (propositions + texte)
export function TexteListe({ label, value, onInput, options, full, id, placeholder }) {
  const lid = id || 'dl-' + Math.random().toString(36).slice(2, 8);
  return html`<${Champ} label=${label} full=${full}>
    <input class="inp" list=${lid} value=${value ?? ''} placeholder=${placeholder} onInput=${e => onInput(e.target.value)} />
    <datalist id=${lid}>${(options || []).map(o => html`<option value=${o} />`)}</datalist><//>`;
}
export const Bascule = ({ on, onChange, label, aide }) => html`<div class="switchrow">
  <div><b>${label}</b>${aide && html`<div class="small muted">${aide}</div>`}</div>
  <button class="toggle" type="button" aria-pressed=${!!on} aria-label=${label} onClick=${() => onChange(!on)}></button></div>`;
export function Pastilles({ options, valeurs, onChange, multi = true, couleur }) {
  const vs = [].concat(valeurs || []);
  const bas = v => multi ? onChange(vs.includes(v) ? vs.filter(x => x !== v) : [...vs, v]) : onChange(vs.includes(v) ? null : v);
  return html`<div class=${cls('chips', couleur && 'col')} style=${couleur ? `--c:${couleur}` : ''}>
    ${options.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return html`<button type="button" aria-pressed=${vs.includes(v)} onClick=${() => bas(v)}>${l}</button>`; })}</div>`;
}

export const Statut = ({ s }) => { const [l, c] = STATUTS[s] || [s, '']; return html`<span class=${cls('pill', c)}>${l}</span>`; };
export const Presta = ({ code, court }) => { const p = prestation(code); return html`<span class="pill" style=${`background:color-mix(in srgb,${p.couleur} 20%,transparent);color:${p.couleur}`}><span class="dot" style=${`background:${p.couleur}`}></span>${court ? p.nom.replace(/ \(.*\)/, '') : p.nom}</span>`; };
export const Chargement = () => html`<div class="spin" role="status" aria-label="Chargement"></div>`;
export const Vide = ({ children }) => html`<div class="empty">${children}</div>`;
export const Titre = ({ sur, children, em, actions }) => html`<div class="head"><div>${sur && html`<div class="eyebrow">${sur}</div>`}<h1 class="ptitle">${children}${em && html` <em>${em}</em>`}</h1></div>${actions && html`<div class="acts">${actions}</div>`}</div>`;

// Charge des données : const [data, recharger, err] = useCharge(async () => ..., [deps])
export function useCharge(fn, deps = []) {
  const [st, setSt] = useState({ data: undefined, err: null });
  const n = useRef(0);
  const go = useCallback(() => {
    const i = ++n.current;
    fn().then(d => i === n.current && setSt({ data: d, err: null }), e => { console.error(e); i === n.current && setSt(s => ({ data: s.data ?? null, err: e })); });
  }, deps);
  useEffect(go, deps);
  return [st.data, go, st.err];
}
// Redessine quand les listes de référence changent
export function useRefData() { const [, set] = useState(0); useEffect(() => onRef(() => set(x => x + 1)), []); }

// Choisir un fichier (photo, document…)
export const choisirFichier = ({ accept = '*/*', multiple = false, capture } = {}) => new Promise(res => {
  const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = multiple;
  if (capture) i.capture = capture;
  i.onchange = () => res([...i.files]); i.click();
});
