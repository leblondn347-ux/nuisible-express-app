// Connexion, création du compte, mot de passe oublié
import { html, useState, Icon } from '../ui.js';
import { sb, trad } from '../db.js';

export function Connexion() {
  const [mode, setMode] = useState('connexion');
  const [email, setEmail] = useState('');
  const [mdp, setMdp] = useState('');
  const [code, setCode] = useState(new URLSearchParams(location.search).get('code') || '');
  const [msg, setMsg] = useState(null);
  const [att, setAtt] = useState(false);

  const go = async e => {
    e.preventDefault(); setMsg(null); setAtt(true);
    try {
      if (mode === 'connexion') {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: mdp });
        if (error) throw error;
      } else if (mode === 'creation') {
        const { data, error } = await sb.auth.signUp({ email: email.trim(), password: mdp, options: { emailRedirectTo: location.origin + location.pathname, data: code.trim() ? { code_acces: code.trim() } : {} } });
        if (error) throw error;
        if (!data.session) setMsg({ ok: true, t: 'Compte créé. Ouvre ta boîte mail et clique sur le lien de confirmation, puis reviens ici pour te connecter.' });
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + location.pathname });
        if (error) throw error;
        setMsg({ ok: true, t: 'Un e-mail vient de partir avec un lien pour choisir un nouveau mot de passe.' });
      }
    } catch (er) { setMsg({ t: trad(er) }); }
    setAtt(false);
  };
  const titres = { connexion: 'Se connecter', creation: 'Créer mon compte', oubli: 'Mot de passe oublié' };
  return html`<div class="login"><form class="box" onSubmit=${go}>
    <div class="brand avec-logo"><img class="rond" src="icons/logo-160.png" alt="" /><div><b>NUISIBLE</b><span>EXPRESS 34</span><small>Gestion des interventions</small></div></div>
    <div class="card stack">
      <h1 class="ptitle" style="font-size:1.7rem">${titres[mode]}</h1>
      ${mode === 'creation' && html`<div class="infobox small">Tu as reçu un <b>code d'accès</b> ? Tape-le ci-dessous. Sans code, ton compte n'aura accès à rien tant que l'administrateur ne t'a pas ajouté.</div>`}
      <label><span class="fl">Adresse e-mail</span><input class="inp" type="email" autocomplete="email" required value=${email} onInput=${e => setEmail(e.target.value)} /></label>
      ${mode !== 'oubli' && html`<label><span class="fl">Mot de passe</span><input class="inp" type="password" minlength="6" autocomplete=${mode === 'creation' ? 'new-password' : 'current-password'} required value=${mdp} onInput=${e => setMdp(e.target.value)} />
        ${mode === 'creation' && html`<div class="hint">6 caractères minimum. Note-le bien.</div>`}</label>`}
      ${mode === 'creation' && html`<label><span class="fl">Code d'accès</span><input class="inp" autocapitalize="characters" autocomplete="off" placeholder="ex. AB7K-2QXM" value=${code} onInput=${e => setCode(e.target.value.toUpperCase())} /></label>`}
      ${msg && html`<div class=${msg.ok ? 'okbox' : 'err'}>${msg.t}</div>`}
      <button class="btn pri block" disabled=${att}>${att ? 'Un instant…' : titres[mode]}</button>
      <div class="row between small">
        ${mode !== 'connexion' ? html`<button type="button" class="link" onClick=${() => { setMode('connexion'); setMsg(null); }}><${Icon} n="back" /> Se connecter</button>`
          : html`<button type="button" class="link" onClick=${() => { setMode('creation'); setMsg(null); }}>Créer mon compte</button>`}
        ${mode === 'connexion' && html`<button type="button" class="link" onClick=${() => { setMode('oubli'); setMsg(null); }}>Mot de passe oublié ?</button>`}
      </div>
    </div></form></div>`;
}

export function NouveauMotDePasse({ fini }) {
  const [mdp, setMdp] = useState('');
  const [msg, setMsg] = useState(null);
  const go = async e => {
    e.preventDefault();
    const { error } = await sb.auth.updateUser({ password: mdp });
    if (error) return setMsg(trad(error));
    location.hash = '#/accueil'; location.reload();
  };
  return html`<div class="login"><form class="box card stack" onSubmit=${go}>
    <h1 class="ptitle" style="font-size:1.6rem">Nouveau <em>mot de passe</em></h1>
    <input class="inp" type="password" minlength="6" required value=${mdp} onInput=${e => setMdp(e.target.value)} autocomplete="new-password" />
    ${msg && html`<div class="err">${msg}</div>`}
    <button class="btn pri">Enregistrer</button></form></div>`;
}
