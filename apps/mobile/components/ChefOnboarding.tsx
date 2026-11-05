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
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [addressRegion, setAddressRegion] = useState('');
  const [addressPostalCode, setAddressPostalCode] = useState('');
  const [addressCountryCode, setAddressCountryCode] = useState('');
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
    const application = await marketplaceApi(apiBaseUrl, auth.token)<
      { status: string } | null
    >('/chefs/me/application');
    if (application && application.status !== 'rejected') {
      await onComplete(auth);
      return;
    }
    setStep(2);
  }

  async function finish() {
    if (!session || !photo || !selected.length) throw new Error('Select your foods and add a photo first.');
    if (!addressLine1.trim() || !addressCity.trim() || !addressRegion.trim() ||
        !addressPostalCode.trim() || !/^[A-Za-z]{2}$/.test(addressCountryCode.trim())) {
      throw new Error('Enter your complete visit address, including a two-letter country code.');
    }
    const request = marketplaceApi(apiBaseUrl, session.token);
    await request('/chefs/me/onboarding', { method: 'POST', body: JSON.stringify({ foods: selected }) });
    await uploadProfilePhoto(apiBaseUrl, session.token, photo);
    await request('/chefs/me/application', {
      method: 'POST',
      body: JSON.stringify({
        line1: addressLine1.trim(),
        line2: addressLine2.trim() || undefined,
        city: addressCity.trim(),
        region: addressRegion.trim(),
        postalCode: addressPostalCode.trim(),
        countryCode: addressCountryCode.trim().toUpperCase(),
      }),
    });
    await onComplete(session);
  }

  return (
    <View style={s.container}>
      <Pressable accessibilityRole="button" style={s.touch} onPress={step > 1 ? () => setStep(step - 1) : onBack}>
        <Text style={s.link}>Back</Text>
      </Pressable>
      <AfroChopLogo />
      <Text style={s.progress}>Step {step} of 4</Text>
      <Text style={s.title}>
        {step === 1 ? 'Become a Chef' : step === 2 ? 'What Do You Cook?' : step === 3 ? 'Add Your Photo' : 'Request a Home Visit'}
      </Text>
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
      </> : step === 3 ? <>
        <Text style={s.text}>Add a photo for the profile AfroChop will help set up during your home visit. It will be shown to customers after setup.</Text>
        {photo ? <Image accessibilityLabel="Profile photo preview" source={{ uri: photo }} style={s.photo} /> : null}
        <PrimaryButton label={photo ? 'Change Photo' : 'Choose Photo'} secondary disabled={busy}
          onPress={() => void perform(async () => { const uri = await pickProfilePhoto(); if (uri) setPhoto(uri); })} />
        <Text style={s.caption}>By finishing, you agree to the Terms of Service and Privacy Policy available from the welcome screen.</Text>
        <PrimaryButton label="Continue to Visit Details" disabled={!photo} onPress={() => setStep(4)} />
        <Text style={s.text}>No bank details needed now. Required safety checks and payout setup happen before paid orders.</Text>
      </> : <>
        <Text style={s.text}>
          An AfroChop team member will visit this address to interview you and help set up your cook profile.
          Your exact address is encrypted and only shared with authorised staff for arranging the visit.
        </Text>
        <AuthInput label="Street address" value={addressLine1} onChangeText={setAddressLine1} maxLength={200} autoComplete="street-address" />
        <AuthInput label="Apartment, suite or unit (optional)" value={addressLine2} onChangeText={setAddressLine2} maxLength={200} />
        <AuthInput label="City" value={addressCity} onChangeText={setAddressCity} maxLength={100} />
        <AuthInput label="State, province or region" value={addressRegion} onChangeText={setAddressRegion} maxLength={100} />
        <AuthInput label="Postal or ZIP code" value={addressPostalCode} onChangeText={setAddressPostalCode} maxLength={32} />
        <AuthInput label="Country code (2 letters)" value={addressCountryCode} onChangeText={setAddressCountryCode}
          autoCapitalize="characters" maxLength={2} />
        <PrimaryButton label="Submit Application" loading={busy}
          disabled={!addressLine1.trim() || !addressCity.trim() || !addressRegion.trim() ||
            !addressPostalCode.trim() || !/^[A-Za-z]{2}$/.test(addressCountryCode.trim())}
          onPress={() => void perform(finish)} />
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
