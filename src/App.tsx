import { useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { initialLinkType } from './lib/initialHash';

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
    setMsg(error ? 'Kunne ikke sende link. Er adressen inviteret?' : 'Hvis adressen er inviteret, er der sendt et login-link.');
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
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    supabase.from('app_user').select('role, active').eq('user_id', session.user.id).maybeSingle().then(({ data }) => {
      setAccess(data as Access);
      setLoaded(true);
    });
  }, [session.user.id]);

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
    <main style={page}>
      <h1>PONTIFEX Nexus 2.0</h1>
      <p>Logget ind som {session.user.email}.</p>
      {needsPassword && (
        <form onSubmit={setPassword}>
          <label>Vælg adgangskode (mindst {MIN_PASSWORD} tegn)
            <input style={field} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
          </label>
          <button style={btn} type="submit">Gem adgangskode</button>
        </form>
      )}
      {msg && <p role="status">{msg}</p>}
      {loaded && (access?.active ? <p>Adgang: {access.role === 'owner' ? 'ejer' : 'medlem'}. Kontaktdatabasen bygges i næste fase, se docs/ROADMAP.md.</p>
                                 : <p>Din konto har endnu ikke fået adgang. Bed ejeren om at aktivere den.</p>)}
      <button style={btn} onClick={() => supabase.auth.signOut()}>Log ud</button>
    </main>
  );
}
