import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AfroChopLogo, AuthInput, AuthScreenLayout, PasswordInput, PrimaryButton, RoleSelectionCard } from './AuthUi';
import { marketplaceApi } from '../lib/marketplaceApi';

export type AccountRole = 'customer' | 'chef' | 'farmer';
export type AccountSession = {
  id: string; token: string; name: string; email: string;
  role: AccountRole; requiresRoleSelection: boolean;
};

export function SharedAccountFlow({ apiBaseUrl, session, initialError, onSession, onSignOut }: {
  apiBaseUrl: string;
  session: AccountSession | null;
  initialError?: string | null;
  onSession: (session: AccountSession) => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const [signup, setSignup] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [selected, setSelected] = useState<AccountRole | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function perform(action: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await action(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not complete sign-in. Please try again.'); }
    finally { setBusy(false); }
  }

  async function authenticate() {
    if (signup && (!name.trim() || password !== confirm || !accepted)) {
      throw new Error('Enter your name, confirm your password, and accept the Terms and Privacy Policy.');
    }
    if (!email.trim() || password.length < 8) throw new Error('Enter your email and a password of at least 8 characters.');
    const request = marketplaceApi(apiBaseUrl);
    if (signup) {
      await request('/auth/register', {
        method: 'POST', body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
      });
      setSignup(false); setPassword(''); setConfirm('');
      setNotice('Account created. Sign in to choose how you will use AfroChop.');
      return;
    }
    const result = await request<AccountSession>('/auth/login', {
      method: 'POST', body: JSON.stringify({ email: email.trim(), password }),
    });
    if (!['customer', 'chef', 'farmer'].includes(result.role)) {
      throw new Error('This account uses administrator access, not a marketplace workspace.');
    }
    await onSession(result);
    setPassword(''); setConfirm('');
  }

  return <AuthScreenLayout><View style={s.content}>
    <AfroChopLogo />
    {session ? <>
      <Text style={s.title}>How will you use AfroChop?</Text>
      <Text style={s.text}>Welcome, {session.name}. Choose one role for this account. This choice is saved once, not requested at every login.</Text>
      <Text style={s.text}>Existing users must confirm a role too. Changing roles preserves your records but hides your old seller profile. Active work or unresolved payments must be finished first; confirm your current role to access them.</Text>
      {([
        { role: 'customer', title: 'Customer', icon: 'C', description: 'Find food, discover cooks and farms, and request bookings.' },
        { role: 'chef', title: 'Chef / Cook', icon: 'C', description: 'Build your cooking profile, share food media, and manage requests.' },
        { role: 'farmer', title: 'Farmer', icon: 'F', description: 'Showcase produce, share farm media, and respond to customers.' },
      ] as const).map((choice) => <RoleSelectionCard key={choice.role} {...choice}
        selected={selected === choice.role} onPress={() => { if (!busy) setSelected(choice.role); }} />)}
      <PrimaryButton label="Confirm Role and Continue" loading={busy} disabled={!selected} onPress={() => void perform(async () => {
        if (!selected) throw new Error('Choose a role first.');
        const result = await marketplaceApi(apiBaseUrl, session.token)<AccountSession>('/auth/me/role', {
          method: 'POST', body: JSON.stringify({ role: selected }),
        });
        await onSession(result);
      })} />
      <PrimaryButton label="Sign Out" secondary disabled={busy} onPress={() => void perform(onSignOut)} />
    </> : <>
      <Text style={s.title}>{signup ? 'Create your account' : 'Sign in to AfroChop'}</Text>
      <Text style={s.text}>One account entry for customers, chefs, and farmers. Choose your role after signing in.</Text>
      {signup ? <AuthInput label="Full name" autoComplete="name" value={name} onChangeText={setName} maxLength={120} /> : null}
      <AuthInput label="Email address" autoComplete="email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <PasswordInput label="Password" value={password} onChangeText={setPassword} />
      {signup ? <>
        <PasswordInput label="Confirm password" value={confirm} onChangeText={setConfirm} />
        <Pressable accessibilityRole="checkbox" aria-checked={accepted} accessibilityState={{ checked: accepted }} disabled={busy}
          onPress={() => setAccepted(!accepted)} style={s.touch}>
          <Text style={s.text}>{accepted ? '[x]' : '[ ]'} I accept the Terms of Service and Privacy Policy.</Text>
        </Pressable>
      </> : null}
      <PrimaryButton label={signup ? 'Create Account' : 'Sign In'} loading={busy} onPress={() => void perform(authenticate)} />
      <PrimaryButton secondary disabled={busy} label={signup ? 'Already have an account? Sign In' : 'New here? Create an Account'}
        onPress={() => { setSignup(!signup); setPassword(''); setConfirm(''); setError(null); setNotice(null); }} />
    </>}
    {notice ? <Text accessibilityRole="alert" style={s.text}>{notice}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {!error && initialError ? <Text accessibilityRole="alert" style={s.error}>{initialError}</Text> : null}
  </View></AuthScreenLayout>;
}

const s = StyleSheet.create({
  content: { padding: 20, gap: 16 },
  title: { color: '#185A43', fontSize: 28, fontWeight: '700' },
  text: { color: '#3A2E22', fontSize: 16 },
  error: { color: '#B84F30', fontSize: 16 },
  touch: { minHeight: 44, justifyContent: 'center' },
});
