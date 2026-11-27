// Zone de signature au doigt (téléphone) ou à la souris
import { html, useRef, useEffect, useState } from '../ui.js';
import { urlFichier } from '../db.js';

export function Signature({ chemin, onSigne, label = 'Signer ici avec le doigt', disabled }) {
  const cv = useRef(null);
  const [url, setUrl] = useState(null);
  const [refaire, setRefaire] = useState(!chemin);
  const traits = useRef(0);
  useEffect(() => { if (chemin) urlFichier('signatures', chemin).then(setUrl); setRefaire(!chemin); }, [chemin]);
  useEffect(() => {
    if (!refaire || !cv.current) return;
    const c = cv.current, r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    c.width = r.width * dpr; c.height = r.height * dpr;
    const x = c.getContext('2d'); x.scale(dpr, dpr); x.lineWidth = 2.4; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#111';
    let bas = false, last = null;
    const pt = e => { const b = c.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    const down = e => { if (disabled) return; bas = true; last = pt(e); c.setPointerCapture(e.pointerId); x.beginPath(); x.arc(last[0], last[1], 1.1, 0, 7); x.fill(); };
    const move = e => { if (!bas) return; const p = pt(e); x.beginPath(); x.moveTo(...last); x.lineTo(...p); x.stroke(); last = p; };
    const up = () => { if (bas) traits.current++; bas = false; };
    c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move); c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    return () => { c.removeEventListener('pointerdown', down); c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up); c.removeEventListener('pointercancel', up); };
  }, [refaire]);
  const effacer = () => { const c = cv.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); traits.current = 0; };
  const valider = () => {
    if (!traits.current) return;
    cv.current.toBlob(b => { onSigne(b); setRefaire(false); setUrl(URL.createObjectURL(b)); }, 'image/png');
  };
  if (!refaire && (url || chemin)) return html`<div class="stack" style="gap:8px"><div class="sig">${url && html`<img src=${url} alt="Signature" />`}</div>
    ${!disabled && html`<button class="link small" style="align-self:flex-start" onClick=${() => setRefaire(true)}>Refaire la signature</button>`}</div>`;
  return html`<div class="stack" style="gap:8px"><div class="sig"><canvas ref=${cv}></canvas><p class="hint">${label}</p></div>
    <div class="row"><button class="btn sm ghost" onClick=${effacer}>Effacer</button><button class="btn sm pri" onClick=${valider}>Valider la signature</button></div></div>`;
}
