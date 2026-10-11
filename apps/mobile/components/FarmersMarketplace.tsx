import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AuthInput, PrimaryButton } from './AuthUi';
import {
  ChatMessage,
  FarmInquiry,
  Farmer,
  createFarmApi,
  farmTheme as c,
  formatPrice,
} from '../lib/farmApi';

type Props = { token: string; apiBaseUrl: string; onBack: () => void };

export function FarmersMarketplace({ token, apiBaseUrl, onBack }: Props) {
  const api = useMemo(() => createFarmApi(apiBaseUrl, token), [apiBaseUrl, token]);
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [inquiries, setInquiries] = useState<FarmInquiry[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Farmer | null>(null);
  const [tab, setTab] = useState<'browse' | 'requests'>('browse');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFarmers = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
      const result = await api<{ items: Farmer[] }>(`/farmers${params}`);
      setFarmers(result.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load farmers.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  const loadInquiries = useCallback(async () => {
    try {
      setInquiries(await api<FarmInquiry[]>('/farmers/inquiries/mine'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your requests.');
    }
  }, [api]);

  useEffect(() => {
    void loadFarmers('');
    void loadInquiries();
  }, [loadFarmers, loadInquiries]);

  if (selected) {
    return (
      <FarmerDetail
        farmer={selected}
        api={api}
        onBack={() => setSelected(null)}
        onInquirySent={() => void loadInquiries()}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={s.content}>
      <Pressable accessibilityRole="button" onPress={onBack} style={s.back}>
        <Text style={s.link}>‹ Back to cooks</Text>
      </Pressable>
      <Text style={s.title}>🌽 Local farmers</Text>
      <Text style={s.sub}>Fresh corn, okra, garden eggs and African vegetables from farms near you.</Text>
      <View style={s.tabs}>
        {(['browse', 'requests'] as const).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[s.tab, tab === t && s.tabOn]}>
            <Text style={[s.tabText, tab === t && s.tabTextOn]}>
              {t === 'browse' ? 'Find farmers' : `My requests (${inquiries.length})`}
            </Text>
          </Pressable>
        ))}
      </View>
      {error ? <Text style={s.error}>{error}</Text> : null}
      {tab === 'browse' ? (
        <>
          <View style={s.searchRow}>
            <TextInput
              accessibilityLabel="Search farmers or produce"
              onChangeText={setSearch}
              onSubmitEditing={() => void loadFarmers(search)}
              placeholder="Search okra, corn, farm or city"
              placeholderTextColor="#8B8175"
              returnKeyType="search"
              style={s.searchInput}
              value={search}
            />
            <Pressable accessibilityRole="button" onPress={() => void loadFarmers(search)} style={s.searchBtn}>
              <Text style={s.searchBtnText}>Search</Text>
            </Pressable>
          </View>
          {loading ? <ActivityIndicator color={c.forest} /> : null}
          {!loading && farmers.length === 0 ? <Text style={s.sub}>No farmers found yet.</Text> : null}
          {farmers.map((farmer) => (
            <Pressable key={farmer.id} accessibilityRole="button" onPress={() => setSelected(farmer)} style={s.card}>
              <Text style={s.cardTitle}>🧑🏾‍🌾 {farmer.farmName}</Text>
              <Text style={s.muted}>{farmer.city}{farmer.state ? `, ${farmer.state}` : ''}</Text>
              <View style={s.chips}>
                {farmer.produce.slice(0, 5).map((p) => (
                  <Text key={p.id} style={s.chip}>{p.name}</Text>
                ))}
              </View>
              <Text style={s.link}>View produce & get a quote ›</Text>
            </Pressable>
          ))}
        </>
      ) : (
        <>
          {inquiries.length === 0 ? <Text style={s.sub}>You have not contacted any farmers yet.</Text> : null}
          {inquiries.map((inq) => (
            <View key={inq.id} style={s.card}>
              <Text style={s.cardTitle}>{inq.farmer?.farmName ?? 'Farmer'}</Text>
              <Text style={s.muted}>{[inq.produceName, inq.quantity].filter(Boolean).join(' · ') || 'General request'}</Text>
              <Text style={s.body}>{inq.message}</Text>
              <Text style={[s.status, inq.status === 'quoted' && s.statusQuoted]}>
                {inq.status === 'quoted'
                  ? `Quote: $${Number(inq.quoteAmount).toFixed(2)}${inq.quoteNotes ? ` — ${inq.quoteNotes}` : ''}`
                  : inq.status === 'declined' ? 'Declined' : 'Waiting for a quote'}
              </Text>
            </View>
          ))}
          <PrimaryButton label="Refresh" secondary onPress={() => void loadInquiries()} />
        </>
      )}
    </ScrollView>
  );
}

function FarmerDetail({
  farmer,
  api,
  onBack,
  onInquirySent,
}: {
  farmer: Farmer;
  api: ReturnType<typeof createFarmApi>;
  onBack: () => void;
  onInquirySent: () => void;
}) {
  const [produceName, setProduceName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [message, setMessage] = useState('');
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadChat = useCallback(async () => {
    try {
      const result = await api<{ items: ChatMessage[] }>(`/messages/with/${farmer.userId}`);
      setChat(result.items);
    } catch {
      setChat([]);
    }
  }, [api, farmer.userId]);

  useEffect(() => {
    void loadChat();
  }, [loadChat]);

  async function sendInquiry() {
    setError(null);
    setNotice(null);
    if (!message.trim()) {
      setError('Tell the farmer what you need.');
      return;
    }
    setBusy(true);
    try {
      await api('/farmers/inquiries', {
        method: 'POST',
        body: JSON.stringify({
          farmerId: farmer.id,
          produceName: produceName.trim() || undefined,
          quantity: quantity.trim() || undefined,
          message: message.trim(),
        }),
      });
      setNotice('Request sent! The farmer will reply with a quote.');
      setMessage('');
      setProduceName('');
      setQuantity('');
      onInquirySent();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send request.');
    } finally {
      setBusy(false);
    }
  }

  async function sendChat() {
    if (!chatText.trim()) return;
    try {
      await api('/messages', {
        method: 'POST',
        body: JSON.stringify({ recipientId: farmer.userId, content: chatText.trim() }),
      });
      setChatText('');
      await loadChat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send message.');
    }
  }

  return (
    <ScrollView contentContainerStyle={s.content}>
      <Pressable accessibilityRole="button" onPress={onBack} style={s.back}>
        <Text style={s.link}>‹ All farmers</Text>
      </Pressable>
      <Text style={s.title}>🧑🏾‍🌾 {farmer.farmName}</Text>
      <Text style={s.muted}>
        {farmer.city}{farmer.state ? `, ${farmer.state}` : ''} ·{' '}
        {[farmer.offersPickup && 'Pickup', farmer.offersDelivery && 'Delivery'].filter(Boolean).join(' & ') || 'Ask about pickup'}
      </Text>
      {farmer.bio ? <Text style={s.body}>{farmer.bio}</Text> : null}

      <Text style={s.section}>Fresh produce</Text>
      {farmer.produce.length === 0 ? <Text style={s.sub}>Nothing listed right now.</Text> : null}
      {farmer.produce.map((p) => (
        <Pressable key={p.id} onPress={() => setProduceName(p.name)} style={s.produceRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>{p.name}</Text>
            {p.description ? <Text style={s.muted}>{p.description}</Text> : null}
          </View>
          <Text style={s.price}>{formatPrice(p.price, p.unit)}</Text>
        </Pressable>
      ))}

      <Text style={s.section}>Request a quote</Text>
      <AuthInput label="Produce" onChangeText={setProduceName} placeholder="e.g. Okra" value={produceName} />
      <AuthInput label="Quantity" onChangeText={setQuantity} placeholder="e.g. 10 lb" value={quantity} />
      <AuthInput
        label="Message"
        multiline
        onChangeText={setMessage}
        placeholder="When do you need it? Pickup or delivery?"
        value={message}
      />
      {error ? <Text style={s.error}>{error}</Text> : null}
      {notice ? <Text style={s.notice}>{notice}</Text> : null}
      <PrimaryButton label="Send request" loading={busy} onPress={() => void sendInquiry()} />

      <Text style={s.section}>Messages</Text>
      {chat.map((m) => (
        <View key={m.id} style={[s.bubble, m.senderId === farmer.userId ? s.theirs : s.mine]}>
          <Text style={s.body}>{m.content}</Text>
        </View>
      ))}
      <View style={s.searchRow}>
        <TextInput
          accessibilityLabel="Message the farmer"
          onChangeText={setChatText}
          placeholder="Write a message"
          placeholderTextColor="#8B8175"
          style={s.searchInput}
          value={chatText}
        />
        <Pressable accessibilityRole="button" onPress={() => void sendChat()} style={s.searchBtn}>
          <Text style={s.searchBtnText}>Send</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  content: { padding: 20, gap: 12, paddingBottom: 48 },
  back: { paddingVertical: 4 },
  link: { color: c.forest, fontWeight: '700' },
  title: { color: c.brown, fontSize: 26, fontWeight: '800' },
  sub: { color: c.muted, fontSize: 15 },
  muted: { color: c.muted, fontSize: 14 },
  body: { color: c.brown, fontSize: 15 },
  section: { color: c.brown, fontSize: 18, fontWeight: '800', marginTop: 12 },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 999, backgroundColor: '#fff', alignItems: 'center', borderWidth: 1, borderColor: '#E3D5BC' },
  tabOn: { backgroundColor: c.forest, borderColor: c.forest },
  tabText: { color: c.brown, fontWeight: '700' },
  tabTextOn: { color: '#fff' },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchInput: { flex: 1, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E3D5BC', paddingHorizontal: 12, paddingVertical: 10, color: c.brown },
  searchBtn: { backgroundColor: c.spice, borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center' },
  searchBtnText: { color: '#fff', fontWeight: '800' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 6, borderWidth: 1, borderColor: '#E3D5BC' },
  cardTitle: { color: c.brown, fontSize: 17, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: '#E8F1EC', color: c.forest, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, fontSize: 13, overflow: 'hidden' },
  produceRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 12, gap: 8, borderWidth: 1, borderColor: '#E3D5BC' },
  price: { color: c.forest, fontWeight: '800' },
  status: { color: c.muted, fontWeight: '700' },
  statusQuoted: { color: c.forest },
  error: { color: c.terracotta, fontWeight: '600' },
  notice: { color: c.forest, fontWeight: '600' },
  bubble: { padding: 10, borderRadius: 12, maxWidth: '85%' },
  mine: { backgroundColor: '#DCEBE3', alignSelf: 'flex-end' },
  theirs: { backgroundColor: '#fff', alignSelf: 'flex-start', borderWidth: 1, borderColor: '#E3D5BC' },
});
