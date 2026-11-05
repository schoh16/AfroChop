import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AfroChopLogo, AuthInput, AuthScreenLayout, PasswordInput, PrimaryButton, RoleSelectionCard } from './AuthUi';
import { marketplaceApi } from '../lib/marketplaceApi';
import { authRequest, getCurrentSession } from '../lib/session';
import type { AccountRole, AccountSession } from '../lib/session';

export type { AccountRole, AccountSession } from '../lib/session';
type AuthMode = 'signin' | 'signup' | 'confirm' | 'forgot' | 'reset';

export function SharedAccountFlow({ apiBaseUrl, session, initialError, onSession, onSignOut }: {
  apiBaseUrl: string;
  session: AccountSession | null;
  initialError?: string | null;
  onSession: (session: AccountSession) => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const [mode, setMode] = useState<AuthMode>('signin');
  const signup = mode === 'signup';
  const [code, setCode] = useState('');
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
    if (!email.trim()) throw new Error('Enter your email address.');
    const body = { email: email.trim().toLowerCase() };
    if (mode === 'confirm') {
      const result = await authRequest<{ message: string }>(apiBaseUrl, 'confirm', { ...body, code });
      changeMode('signin'); setNotice(result.message); return;
    }
    if (mode === 'forgot') {
      const result = await authRequest<{ message: string }>(apiBaseUrl, 'forgot-password', body);
      changeMode('reset'); setNotice(result.message); return;
    }
    if (signup && (!name.trim() || password !== confirm || !accepted)) {
      throw new Error('Enter your name, confirm your password, and accept the Terms and Privacy Policy.');
    }
    if (password.length < 8) throw new Error('Enter a password of at least 8 characters.');
    if (mode === 'reset') {
      if (password !== confirm) throw new Error('Your passwords do not match.');
      const result = await authRequest<{ message: string }>(apiBaseUrl, 'reset-password', { ...body, code, password });
      changeMode('signin'); setNotice(result.message); return;
    }
    if (signup) {
      const result = await authRequest<{ message: string }>(apiBaseUrl, 'register', {
        name: name.trim(), ...body, password,
      });
      changeMode('confirm'); setNotice(result.message);
      return;
    }
    const result = await authRequest<AccountSession>(apiBaseUrl, 'login', { ...body, password });
    if (!['customer', 'chef', 'farmer'].includes(result.role)) {
      throw new Error('This account uses administrator access, not a marketplace workspace.');
    }
    await onSession(result);
    setPassword(''); setConfirm('');
  }

  function changeMode(next: AuthMode) {
    setMode(next); setPassword(''); setConfirm(''); setCode(''); setError(null); setNotice(null);
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
        const result = await marketplaceApi(apiBaseUrl, session.token)<Pick<AccountSession, 'id' | 'name' | 'email' | 'role' | 'requiresRoleSelection'>>('/auth/me/role', {
          method: 'POST', body: JSON.stringify({ role: selected }),
        });
        await onSession({ ...await getCurrentSession(), ...result });
      })} />
      <PrimaryButton label="Sign Out" secondary disabled={busy} onPress={() => void perform(onSignOut)} />
    </> : <>
      <Text style={s.title}>{({
        signin: 'Sign in to AfroChop', signup: 'Create / migrate your account',
        confirm: 'Verify your email', forgot: 'Forgot your password?', reset: 'Choose a new password',
      })[mode]}</Text>
      <Text style={s.text}>One account for customers, chefs, and farmers. Your password is managed by Amazon Cognito, never saved on this device.</Text>
      {signup ? <Text style={s.text}>Already have an AfroChop account from before this upgrade? Use the same email, choose a new password, and verify your email to keep your profile and bookings. Administrator accounts must contact support.</Text> : null}
      {signup ? <AuthInput label="Full name" autoComplete="name" value={name} onChangeText={setName} maxLength={120} /> : null}
      <AuthInput label="Email address" autoComplete="email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} editable={!busy} />
      {mode === 'confirm' || mode === 'reset' ? <AuthInput label="Email verification code" autoComplete="one-time-code"
        keyboardType="number-pad" value={code} onChangeText={setCode} maxLength={6} editable={!busy} /> : null}
      {mode === 'signin' || signup || mode === 'reset' ? <PasswordInput label={mode === 'reset' ? 'New password' : 'Password'}
        value={password} onChangeText={setPassword} editable={!busy} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} /> : null}
      {signup || mode === 'reset' ? <>
        <Text style={s.text}>Use at least 8 characters, including uppercase, lowercase, a number, and a symbol.</Text>
        <PasswordInput label="Confirm password" value={confirm} onChangeText={setConfirm} editable={!busy} autoComplete="new-password" />
      </> : null}
      {signup ? <>
        <Pressable accessibilityRole="checkbox" aria-checked={accepted} accessibilityState={{ checked: accepted }} disabled={busy}
          onPress={() => setAccepted(!accepted)} style={s.touch}>
          <Text style={s.text}>{accepted ? '[x]' : '[ ]'} I accept the Terms of Service and Privacy Policy.</Text>
        </Pressable>
      </> : null}
      <PrimaryButton label={({
        signin: 'Sign In', signup: 'Create / Migrate Account', confirm: 'Verify Email',
        forgot: 'Send Reset Code', reset: 'Reset Password',
      })[mode]} loading={busy} onPress={() => void perform(authenticate)} />
      {mode === 'signin' ? <>
        <PrimaryButton secondary disabled={busy} label="Forgot Password?" onPress={() => changeMode('forgot')} />
        <PrimaryButton secondary disabled={busy} label="Create / Migrate Account" onPress={() => changeMode('signup')} />
        <PrimaryButton secondary disabled={busy} label="Verify Email / Resend Confirmation Code" onPress={() => changeMode('confirm')} />
      </> : <PrimaryButton secondary disabled={busy} label="Back to Sign In" onPress={() => changeMode('signin')} />}
      {mode === 'confirm' ? <PrimaryButton secondary disabled={busy} label="Resend Confirmation Code"
        onPress={() => void perform(async () => {
          if (!email.trim()) throw new Error('Enter your email address.');
          const result = await authRequest<{ message: string }>(apiBaseUrl, 'resend-confirmation', { email: email.trim() });
          setNotice(result.message);
        })} /> : null}
      {mode === 'reset' ? <PrimaryButton secondary disabled={busy} label="Request Another Reset Code" onPress={() => changeMode('forgot')} /> : null}
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
