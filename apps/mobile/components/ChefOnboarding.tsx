import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { AfroChopLogo, AuthInput, PrimaryButton } from './AuthUi';
import { marketplaceApi } from '../lib/marketplaceApi';
import { pickProfilePhoto, uploadProfilePhoto } from '../lib/profilePhoto';

type Food = { id: string; name: string; dishCountries: { country: { id: string; name: string } }[] };
type Selection = { dishId?: string; name: string; cuisineCountryId?: string };
type Session = { token: string; name: string; email: string };

export function ChefOnboarding({ apiBaseUrl, countries, onBack, onPasswordSignIn, onComplete }: {
  apiBaseUrl: string;
  countries: { id: string; name: string }[];
  onBack: () => void;
  onPasswordSignIn: () => void;
  onComplete: (session: Session) => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [foods, setFoods] = useState<Food[]>([]);
  const [selected, setSelected] = useState<Selection[]>([]);
  const [query, setQuery] = useState('');
  const [custom, setCustom] = useState('');
  const [countryId, setCountryId] = useState<string>();
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [foodsLoading, setFoodsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    marketplaceApi(apiBaseUrl)<Food[]>('/catalog/foods')
      .then((items) => { if (active) setFoods(items); })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : 'Could not load foods.'); })
      .finally(() => { if (active) setFoodsLoading(false); });
    return () => { active = false; };
  }, [apiBaseUrl]);

  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await action(); } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally { setBusy(false); }
  }

  async function verify() {
    const auth = await marketplaceApi(apiBaseUrl)<Session>('/auth/chef/verify-code', {
      method: 'POST', body: JSON.stringify({ name: name.trim(), email: email.trim(), code: code.trim() }),
    });
    setSession(auth);
    const me = await marketplaceApi(apiBaseUrl, auth.token)<{ onboardingComplete: boolean }>('/auth/me');
    if (me.onboardingComplete) { await onComplete(auth); return; }
    setStep(2);
  }

  async function finish() {
    if (!session || !photo || !selected.length) throw new Error('Select your foods and add a photo first.');
    const request = marketplaceApi(apiBaseUrl, session.token);
    await request('/chefs/me/onboarding', { method: 'POST', body: JSON.stringify({ foods: selected }) });
    await uploadProfilePhoto(apiBaseUrl, session.token, photo);
    await onComplete(session);
  }

  return (
    <View style={s.container}>
      <Pressable accessibilityRole="button" style={s.touch} onPress={step > 1 ? () => setStep(step - 1) : onBack}>
        <Text style={s.link}>Back</Text>
      </Pressable>
      <AfroChopLogo />
      <Text style={s.progress}>Step {step} of 3</Text>
      <Text style={s.title}>{step === 1 ? 'Become a Chef' : step === 2 ? 'What Do You Cook?' : 'Add Your Photo'}</Text>
      {step === 1 ? <>
        <Text style={s.text}>New here or returning? We will email you a secure sign-in code.</Text>
        <AuthInput label="Full name" value={name} onChangeText={setName} editable={!codeSent} autoComplete="name" />
        <AuthInput label="Email address" value={email} onChangeText={setEmail} editable={!codeSent}
          keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
        {codeSent ? <>
          <Text style={s.text}>Check your email for the code. It expires in 10 minutes.</Text>
          <AuthInput label="Email verification code" value={code} onChangeText={setCode}
            keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} />
          <PrimaryButton label="Verify and Continue" loading={busy} disabled={code.trim().length !== 6}
            onPress={() => void perform(verify)} />
          <PrimaryButton label="Change email or request a new code" secondary disabled={busy}
            onPress={() => { setCodeSent(false); setCode(''); }} />
        </> : <PrimaryButton label="Email Me a Code" loading={busy} disabled={!name.trim() || !email.trim()}
          onPress={() => void perform(async () => {
            await marketplaceApi(apiBaseUrl)('/auth/chef/email-code', {
              method: 'POST', body: JSON.stringify({ name: name.trim(), email: email.trim() }),
            });
            setCodeSent(true);
          })} />}
        <PrimaryButton label="Use my existing password instead" secondary disabled={busy} onPress={onPasswordSignIn} />
      </> : step === 2 ? <>
        <Text style={s.text}>Choose as many foods as you like. No prices needed.</Text>
        <AuthInput label="Search foods" value={query} onChangeText={setQuery} />
        {foodsLoading ? <ActivityIndicator /> : null}
        <View style={s.choices}>
          {foods.filter((food) => food.name.toLowerCase().includes(query.trim().toLowerCase())).map((food) => {
            const checked = selected.some((item) => item.dishId === food.id);
            return <Pressable key={food.id} accessibilityRole="checkbox" accessibilityState={{ checked }}
              style={[s.chip, checked && s.checked]} onPress={() => setSelected((items) => checked
                ? items.filter((item) => item.dishId !== food.id) : [...items, { dishId: food.id, name: food.name }])}>
              <Text style={checked ? s.checkedText : s.text}>{food.name}</Text>
              <Text style={checked ? s.checkedText : s.caption}>{food.dishCountries.map(({ country }) => country.name).join(', ')}</Text>
            </Pressable>;
          })}
        </View>
        <AuthInput label="Other food" value={custom} onChangeText={setCustom} maxLength={120} />
        <Text style={s.text}>Country for your custom food (optional)</Text>
        <View style={s.choices}>{countries.map((country) => <Pressable key={country.id} accessibilityRole="button"
          accessibilityState={{ selected: countryId === country.id }} style={[s.chip, countryId === country.id && s.checked]}
          onPress={() => setCountryId(countryId === country.id ? undefined : country.id)}>
          <Text style={countryId === country.id ? s.checkedText : s.text}>{country.name}</Text>
        </Pressable>)}</View>
        <PrimaryButton label="Add Custom Food" secondary disabled={custom.trim().length < 2 || selected.length >= 50}
          onPress={() => {
            if (!selected.some((item) => item.name.toLowerCase() === custom.trim().toLowerCase())) {
              setSelected([...selected, { name: custom.trim(), cuisineCountryId: countryId }]);
            }
            setCustom('');
          }} />
        {selected.map((food, index) => <Pressable key={`${food.name}-${index}`} accessibilityRole="button"
          accessibilityLabel={`Remove ${food.name}`} style={s.touch}
          onPress={() => setSelected(selected.filter((_, i) => i !== index))}>
          <Text style={s.link}>{food.name} - Remove</Text>
        </Pressable>)}
        <PrimaryButton label="Continue" disabled={!selected.length || selected.length > 50} onPress={() => setStep(3)} />
      </> : <>
        <Text style={s.text}>Let customers recognize you. Your photo will be public.</Text>
        {photo ? <Image accessibilityLabel="Profile photo preview" source={{ uri: photo }} style={s.photo} /> : null}
        <PrimaryButton label={photo ? 'Change Photo' : 'Choose Photo'} secondary disabled={busy}
          onPress={() => void perform(async () => { const uri = await pickProfilePhoto(); if (uri) setPhoto(uri); })} />
        <Text style={s.caption}>By finishing, you agree to the Terms of Service and Privacy Policy available from the welcome screen.</Text>
        <PrimaryButton label="Finish and Open My Dashboard" disabled={!photo} loading={busy} onPress={() => void perform(finish)} />
        <Text style={s.text}>No bank details needed now. Required safety checks and payout setup happen before paid orders.</Text>
      </>}
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  container: { padding: 20, gap: 16, width: '100%', maxWidth: 640, alignSelf: 'center' },
  title: { fontSize: 28, fontWeight: '800', color: '#185A43' },
  progress: { color: '#756C61', fontSize: 16 }, text: { fontSize: 16, color: '#3A2E22' },
  caption: { fontSize: 14, color: '#756C61' }, error: { color: '#B84F30', fontSize: 16 },
  link: { color: '#185A43', fontWeight: '700', fontSize: 16 }, touch: { minHeight: 48, justifyContent: 'center' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 48, padding: 12, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#185A43' },
  checked: { backgroundColor: '#185A43' }, checkedText: { color: '#fff', fontSize: 16 },
  photo: { width: 160, height: 160, borderRadius: 80, alignSelf: 'center' },
});
