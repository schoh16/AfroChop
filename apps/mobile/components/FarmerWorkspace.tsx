import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { LocationDropdowns } from './LocationDropdowns';
import { AfroChopLogo, AuthInput, PasswordInput, PrimaryButton } from './AuthUi';
import {
  ChatMessage,
  FarmInquiry,
  Produce,
  createFarmApi,
  farmTheme as c,
  formatPrice,
} from '../lib/farmApi';

type FarmerProfile = {
  farmName: string;
  bio: string | null;
  city: string;
  state: string | null;
  offersPickup: boolean;
  offersDelivery: boolean;
  produce: Produce[];
};

export function FarmerAuth({
  apiBaseUrl,
  countries,
  isSignIn,
  onBack,
  onAuthenticated,
}: {
  apiBaseUrl: string;
  countries: { code?: string; name: string }[];
  isSignIn: boolean;
  onBack: () => void;
  onAuthenticated: (token: string, name: string) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [farmName, setFarmName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [countryCode, setCountryCode] = useState('US');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    if (!email.trim() || password.length < 8 ||
        (!isSignIn && (!name.trim() || !farmName.trim() || !city.trim()))) {
      setError(isSignIn
        ? 'Enter your email and password.'
        : 'Enter your name, farm name, city, email and a password of at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      const anon = createFarmApi(apiBaseUrl);
      const auth = await anon<{ token: string; name: string; role: string }>(
        `/auth/${isSignIn ? 'login' : 'register'}`,
        {
          method: 'POST',
          body: JSON.stringify(isSignIn
            ? { email: email.trim(), password }
            : { name: name.trim(), email: email.trim(), password, role: 'farmer' }),
        },
      );
      if (auth.role !== 'farmer') throw new Error('This account is not registered as a farmer.');
      if (!isSignIn) {
        await createFarmApi(apiBaseUrl, auth.token)('/farmers/me/profile', {
          method: 'PUT',
          body: JSON.stringify({
            farmName: farmName.trim(),
            city: city.trim(),
            state: state.trim() || undefined,
            countryCode: countryCode || 'US',
            offersPickup: true,
          }),
        });
      }
      onAuthenticated(auth.token, auth.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={s.content}>
      <Pressable accessibilityRole="button" onPress={onBack} style={s.back}>
        <Text style={s.link}>‹ Back</Text>
      </Pressable>
      <AfroChopLogo />
      <Text style={s.title}>{isSignIn ? 'Welcome back, farmer' : 'Join as a local farmer'}</Text>
      {!isSignIn ? (
        <>
          <AuthInput label="Your name" onChangeText={setName} value={name} />
          <AuthInput label="Farm name" onChangeText={setFarmName} value={farmName} />
          <LocationDropdowns
            countries={countries}
            apiBaseUrl={apiBaseUrl}
            countryCode={countryCode}
            countryName={countries.find(({ code }) => code === countryCode)?.name ?? ''}
            state={state}
            city={city}
            onCountryChange={(code) => {
              setCountryCode(code);
              setState('');
              setCity('');
            }}
            onStateChange={setState}
            onCityChange={setCity}
          />
        </>
      ) : null}
      <AuthInput label="Email" autoCapitalize="none" keyboardType="email-address" onChangeText={setEmail} value={email} />
      <PasswordInput onChangeText={setPassword} value={password} />
      {error ? <Text style={s.error}>{error}</Text> : null}
      <PrimaryButton label={isSignIn ? 'Sign in' : 'Create farmer account'} loading={busy} onPress={() => void submit()} />
    </ScrollView>
  );
}

export function FarmerWorkspace({
  token,
  apiBaseUrl,
  onSignOut,
}: {
  token: string;
  apiBaseUrl: string;
  onSignOut: () => void;
}) {
  const api = useMemo(() => createFarmApi(apiBaseUrl, token), [apiBaseUrl, token]);
  const [profile, setProfile] = useState<FarmerProfile | null>(null);
  const [inquiries, setInquiries] = useState<FarmInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('');
  const [description, setDescription] = useState('');

  const load = useCallback(async () => {
    try {
      const [p, i] = await Promise.all([
        api<FarmerProfile>('/farmers/me/profile'),
        api<FarmInquiry[]>('/farmers/me/inquiries'),
      ]);
      setProfile(p);
      setInquiries(i);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your farm.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>, success?: string) {
    setError(null);
    setNotice(null);
    try {
      await action();
      if (success) setNotice(success);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  }

  function addProduce() {
    if (!name.trim()) {
      setError('Enter the produce name.');
      return;
    }
    void run(async () => {
      await api('/farmers/me/produce', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          price: price.trim() ? Number(price) : undefined,
          unit: unit.trim() || undefined,
          description: description.trim() || undefined,
        }),
      });
      setName('');
      setPrice('');
      setUnit('');
      setDescription('');
    }, 'Produce added.');
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={c.forest} /></View>;
  }

  return (
    <ScrollView contentContainerStyle={s.content}>
      <AfroChopLogo />
      <Text style={s.title}>🧑🏾‍🌾 {profile?.farmName ?? 'My farm'}</Text>
      <Text style={s.muted}>{profile ? `${profile.city}${profile.state ? `, ${profile.state}` : ''}` : ''}</Text>
      {error ? <Text style={s.error}>{error}</Text> : null}
      {notice ? <Text style={s.notice}>{notice}</Text> : null}

      <Text style={s.section}>Customer requests ({inquiries.length})</Text>
      {inquiries.length === 0 ? <Text style={s.muted}>No requests yet.</Text> : null}
      {inquiries.map((inq) => (
        <InquiryCard key={inq.id} inquiry={inq} api={api} onChanged={load} />
      ))}

      <Text style={s.section}>Add produce</Text>
      <AuthInput label="Name" onChangeText={setName} placeholder="Fresh corn, okra, garden eggs…" value={name} />
      <AuthInput label="Price" keyboardType="decimal-pad" onChangeText={setPrice} placeholder="4.50" value={price} />
      <AuthInput label="Unit" onChangeText={setUnit} placeholder="lb, ear, bunch" value={unit} />
      <AuthInput label="Description" onChangeText={setDescription} value={description} />
      <PrimaryButton label="Add to my farm" onPress={addProduce} />

      <Text style={s.section}>My produce</Text>
      {(profile?.produce ?? []).map((p) => (
        <View key={p.id} style={s.card}>
          <View style={s.rowBetween}>
            <Text style={s.cardTitle}>{p.name}</Text>
            <Text style={s.price}>{formatPrice(p.price, p.unit)}</Text>
          </View>
          <View style={s.rowBetween}>
            <Text style={s.muted}>{p.isAvailable ? 'Available' : 'Sold out'}</Text>
            <Switch
              value={Boolean(p.isAvailable)}
              onValueChange={(value) =>
                void run(() => api(`/farmers/me/produce/${p.id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ name: p.name, isAvailable: value }),
                }))}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => void run(() => api(`/farmers/me/produce/${p.id}`, { method: 'DELETE' }))}
          >
            <Text style={s.remove}>Remove</Text>
          </Pressable>
        </View>
      ))}

      <PrimaryButton label="Sign out" secondary onPress={onSignOut} />
    </ScrollView>
  );
}

function InquiryCard({
  inquiry,
  api,
  onChanged,
}: {
  inquiry: FarmInquiry;
  api: ReturnType<typeof createFarmApi>;
  onChanged: () => Promise<void>;
}) {
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [reply, setReply] = useState('');
  const [thread, setThread] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadThread = useCallback(async () => {
    try {
      const r = await api<{ items: ChatMessage[] }>(`/messages/with/${inquiry.customerId}`);
      setThread(r.items);
    } catch {
      setThread([]);
    }
  }, [api, inquiry.customerId]);

  useEffect(() => {
    void loadThread();
  }, [loadThread]);

  async function guarded(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  }

  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>{inquiry.customer?.name ?? 'Customer'}</Text>
      <Text style={s.muted}>{[inquiry.produceName, inquiry.quantity].filter(Boolean).join(' · ') || 'General request'}</Text>
      <Text style={s.body}>{inquiry.message}</Text>
      {inquiry.status === 'requested' ? (
        <>
          <AuthInput label="Quote amount ($)" keyboardType="decimal-pad" onChangeText={setAmount} value={amount} />
          <AuthInput label="Notes" onChangeText={setNotes} value={notes} />
          <PrimaryButton
            label="Send quote"
            onPress={() => {
              const value = Number(amount);
              if (!(value > 0)) {
                setError('Enter a quote amount.');
                return;
              }
              void guarded(() => api(`/farmers/inquiries/${inquiry.id}/quote`, {
                method: 'POST',
                body: JSON.stringify({ amount: value, notes: notes.trim() || undefined }),
              }));
            }}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => void guarded(() => api(`/farmers/inquiries/${inquiry.id}/decline`, { method: 'PATCH' }))}
          >
            <Text style={s.remove}>Decline</Text>
          </Pressable>
        </>
      ) : (
        <Text style={s.status}>
          {inquiry.status === 'quoted' ? `Quoted $${Number(inquiry.quoteAmount).toFixed(2)}` : inquiry.status}
        </Text>
      )}
      {thread.map((m) => (
        <View key={m.id} style={[s.bubble, m.senderId === inquiry.customerId ? s.theirs : s.mine]}>
          <Text style={s.body}>{m.content}</Text>
        </View>
      ))}
      <View style={s.row}>
        <TextInput
          accessibilityLabel="Reply to customer"
          onChangeText={setReply}
          placeholder="Reply to customer"
          placeholderTextColor="#8B8175"
          style={s.input}
          value={reply}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (!reply.trim()) return;
            void (async () => {
              await guarded(() => api('/messages', {
                method: 'POST',
                body: JSON.stringify({ recipientId: inquiry.customerId, content: reply.trim() }),
              }));
              setReply('');
              await loadThread();
            })();
          }}
          style={s.sendBtn}
        >
          <Text style={s.sendText}>Send</Text>
        </Pressable>
      </View>
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  content: { padding: 20, gap: 12, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  back: { paddingVertical: 4 },
  link: { color: c.forest, fontWeight: '700' },
  title: { color: c.brown, fontSize: 24, fontWeight: '800' },
  section: { color: c.brown, fontSize: 18, fontWeight: '800', marginTop: 12 },
  muted: { color: c.muted, fontSize: 14 },
  body: { color: c.brown, fontSize: 15 },
  error: { color: c.terracotta, fontWeight: '600' },
  notice: { color: c.forest, fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 8, borderWidth: 1, borderColor: '#E3D5BC' },
  cardTitle: { color: c.brown, fontSize: 17, fontWeight: '800' },
  price: { color: c.forest, fontWeight: '800' },
  status: { color: c.forest, fontWeight: '700' },
  remove: { color: c.terracotta, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  input: { flex: 1, backgroundColor: '#FBF6EC', borderRadius: 12, borderWidth: 1, borderColor: '#E3D5BC', paddingHorizontal: 12, paddingVertical: 10, color: c.brown },
  sendBtn: { backgroundColor: c.spice, borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center' },
  sendText: { color: '#fff', fontWeight: '800' },
  bubble: { padding: 10, borderRadius: 12, maxWidth: '85%' },
  mine: { backgroundColor: '#DCEBE3', alignSelf: 'flex-end' },
  theirs: { backgroundColor: '#FBF6EC', alignSelf: 'flex-start', borderWidth: 1, borderColor: '#E3D5BC' },
});
