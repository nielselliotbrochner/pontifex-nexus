import { useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { initialLinkType } from './lib/initialHash';
import { href, onLink, useRoute } from './lib/nav';
import { Persons } from './pages/Persons';
import { Companies } from './pages/Companies';
import { Person } from './pages/Person';
import { Company } from './pages/Company';
import { Admin } from './pages/Admin';

const MIN_PASSWORD = 12;
const page: React.CSSProperties = { fontFamily: 'system-ui, sans-serif', maxWidth: 420, margin: '10vh auto', padding: 24 };
const field: React.CSSProperties = { display: 'block', width: '100%', padding: 10, margin: '6px 0 14px', boxSizing: 'border-box' };
const btn: React.CSSProperties = { padding: '10px 16px', marginRight: 8, cursor: 'pointer' };

type Access = { role: string; active: boolean } | null;

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(initialLinkType === 'invite' || initialLinkType === 'recovery');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setNeedsPassword(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!ready) return <main style={page}>Indlæser...</main>;
  if (!session) return <Login />;
  return <Home session={session} needsPassword={needsPassword} onPasswordSet={() => setNeedsPassword(false)} />;
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');

  async function signInPassword(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setMsg(error ? 'Login mislykkedes. Tjek e-mail og adgangskode, eller bed om et login-link.' : '');
  }

  async function sendLink() {
    if (!email) return setMsg('Skriv din e-mail først.');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: window.location.origin + window.location.pathname },
    });
    if (error) {
      setMsg(error.status === 429
        ? 'Supabase tillader kun få e-mails i timen på gratisplanen. Prøv igen om en time, eller log ind med adgangskode.'
        : 'Kunne ikke sende link. Er adressen inviteret?');
    } else {
      setMsg('Hvis adressen er inviteret, er der sendt et login-link.');
    }
  }

  return (
    <main style={page}>
      <h1>PONTIFEX Nexus</h1>
      <form onSubmit={signInPassword}>
        <label>E-mail<input style={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></label>
        <label>Adgangskode<input style={field} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
        <button style={btn} type="submit">Log ind</button>
        <button style={btn} type="button" onClick={sendLink}>Send login-link</button>
      </form>
      {msg && <p role="status">{msg}</p>}
    </main>
  );
}

function Home({ session, needsPassword, onPasswordSet }: { session: Session; needsPassword: boolean; onPasswordSet: () => void }) {
  const [access, setAccess] = useState<Access>(null);
  const [loaded, setLoaded] = useState(false);
  const route = useRoute();
  const [priv, setPriv] = useState(() => { try { return localStorage.getItem('nexus.priv') !== '0'; } catch { return true; } });

  useEffect(() => {
    supabase.from('app_user').select('role, active').eq('user_id', session.user.id).maybeSingle().then(({ data }) => {
      setAccess(data as Access);
      setLoaded(true);
    });
  }, [session.user.id]);

  function togglePriv(v: boolean) {
    setPriv(v);
    try { localStorage.setItem('nexus.priv', v ? '1' : '0'); } catch { /* ignoreres */ }
  }

  if (!loaded) return <main style={page}>Indlæser...</main>;
  if (!access?.active) {
    return (
      <main style={page}>
        <h1>PONTIFEX Nexus</h1>
        <p>Din konto har endnu ikke fået adgang. Bed ejeren om at aktivere den.</p>
        <button style={btn} onClick={() => supabase.auth.signOut()}>Log ud</button>
      </main>
    );
  }
  const owner = access.role === 'owner';
  const view = route.view;
  const tab = (v: string, label: string, match: string[]) => (
    <a href={href(v)} className={match.includes(view) ? 'on' : ''} onClick={(e) => onLink(e, v)}>{label}</a>
  );

  return (
    <>
      <header className="top">
        <span className="brand">PONTIFEX Nexus</span>
        <nav>
          {tab('personer', 'Personer', ['personer', 'person'])}
          {tab('virksomheder', 'Virksomheder', ['virksomheder', 'virksomhed'])}
          {owner && tab('admin', 'Admin', ['admin'])}
          {tab('konto', 'Konto', ['konto'])}
        </nav>
        <span className="right">
          <label title="Viser kendskab, noter og modenhed. Slå fra før du deler skærm."><input type="checkbox" checked={priv} onChange={(e) => togglePriv(e.target.checked)} /> Privat visning</label>
          <span>{session.user.email}</span>
          <button onClick={() => supabase.auth.signOut()}>Log ud</button>
        </span>
      </header>
      <main className="wrap">
        {view === 'personer' && <Persons priv={priv} />}
        {view === 'person' && route.id && <Person id={route.id} priv={priv} />}
        {view === 'virksomheder' && <Companies />}
        {view === 'virksomhed' && route.id && <Company id={route.id} priv={priv} />}
        {view === 'admin' && (owner ? <Admin userId={session.user.id} /> : <p>Kun ejeren har adgang til Admin.</p>)}
        {view === 'konto' && <Account email={session.user.email ?? ''} needsPassword={needsPassword} onPasswordSet={onPasswordSet} />}
        {!['personer', 'person', 'virksomheder', 'virksomhed', 'admin', 'konto'].includes(view) && <p>Siden findes ikke.</p>}
      </main>
    </>
  );
}

function Account({ email, needsPassword, onPasswordSet }: { email: string; needsPassword: boolean; onPasswordSet: () => void }) {
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  async function setPassword(e: FormEvent) {
    e.preventDefault();
    if (pw.length < MIN_PASSWORD) return setMsg(`Adgangskoden skal have mindst ${MIN_PASSWORD} tegn.`);
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) return setMsg('Kunne ikke gemme adgangskoden: ' + error.message);
    setPw('');
    setMsg('Adgangskoden er gemt.');
    onPasswordSet();
  }
  return (
    <div style={{ maxWidth: 420 }}>
      <h1>Konto</h1>
      <p>Logget ind som {email}.</p>
      <form onSubmit={setPassword}>
        <label>{needsPassword ? 'Vælg adgangskode' : 'Skift adgangskode'} (mindst {MIN_PASSWORD} tegn)
          <input style={field} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        </label>
        <button style={btn} type="submit">Gem adgangskode</button>
      </form>
      {msg && <p role="status">{msg}</p>}
    </div>
  );
}
