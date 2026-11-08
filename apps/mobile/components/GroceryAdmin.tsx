import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { PrimaryButton } from './AuthUi';
import type { marketplaceApi } from '../lib/marketplaceApi';
import { pickProfilePhoto, uploadGroceryProductPhoto } from '../lib/profilePhoto';
import {
  dollarsToCents, emptyGroceryAddress, formatCents, groceryStatusLabels, validateGroceryAddress,
  type GroceryAddress, type GroceryAdminProduct, type GroceryOrder,
} from '../lib/grocery';

type Api = ReturnType<typeof marketplaceApi>;
type Section = 'orders' | 'products' | 'settings';
type ProductForm = {
  id?: string; expectedUpdatedAt?: string; name: string; description: string; ingredients: string;
  allergenNotice: string; imageUrl: string | null; price: string; stock: string; weightOz: string;
  lengthIn: string; widthIn: string; heightIn: string; taxCode: string; active: boolean;
};

const emptyProduct: ProductForm = {
  name: '', description: '', ingredients: '', allergenNotice: '', imageUrl: null, price: '', stock: '0',
  weightOz: '', lengthIn: '', widthIn: '', heightIn: '', taxCode: '', active: true,
};
const defaultPickupNote = 'Pickup is not offered. All AfroChop grocery orders ship by carrier.';
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

export function GroceryAdmin({ api, apiBaseUrl, token }: { api: Api; apiBaseUrl: string; token: string }) {
  const [section, setSection] = useState<Section>('orders');
  return <View style={s.wrap}>
    <View style={s.tabs}>
      {(['orders', 'products', 'settings'] as const).map((tab) => (
        <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: section === tab }}
          onPress={() => setSection(tab)} style={[s.tab, section === tab && s.tabActive]}>
          <Text style={[s.tabText, section === tab && s.tabTextActive]}>
            {tab === 'orders' ? 'Orders' : tab === 'products' ? 'Products' : 'Store settings'}
          </Text>
        </Pressable>
      ))}
    </View>
    {section === 'orders' ? <Orders api={api} /> : section === 'products'
      ? <Products api={api} apiBaseUrl={apiBaseUrl} token={token} /> : <Settings api={api} />}
  </View>;
}

function AddressFields({ value, onChange }: { value: GroceryAddress; onChange: (next: GroceryAddress) => void }) {
  const fields: [keyof GroceryAddress, string][] = [
    ['name', 'Sender name'], ['street1', 'Street'], ['street2', 'Suite (optional)'], ['city', 'City'],
    ['state', 'State (2 letters)'], ['zip', 'ZIP'], ['phone', 'Phone'],
  ];
  return <>{fields.map(([key, label]) => (
    <Field key={key} label={label} value={value[key] ?? ''} onChange={(text) => onChange({ ...value, [key]: text })}
      maxLength={key === 'state' ? 2 : undefined} />
  ))}</>;
}

function Field({ label, value, onChange, multiline, keyboardType, maxLength, placeholder }: {
  label: string; value: string; onChange: (text: string) => void; multiline?: boolean;
  keyboardType?: 'decimal-pad' | 'number-pad'; maxLength?: number; placeholder?: string;
}) {
  return <View style={s.field}>
    <Text style={s.label}>{label}</Text>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} multiline={multiline}
      keyboardType={keyboardType} maxLength={maxLength} placeholder={placeholder} placeholderTextColor="#9ca3af"
      style={[s.input, multiline && s.multiline]} />
  </View>;
}

function Settings({ api }: { api: Api }) {
  const [origin, setOrigin] = useState<GroceryAddress>(emptyGroceryAddress);
  const [pickupInstructions, setPickupInstructions] = useState(defaultPickupNote);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void api<{ origin: GroceryAddress; enabled: boolean; pickupInstructions: string } | null>('/grocery/admin/settings', { cache: 'no-store' })
      .then((settings) => {
        if (!active || !settings) return;
        setOrigin({ ...emptyGroceryAddress, ...settings.origin });
        setPickupInstructions(settings.pickupInstructions);
        setEnabled(settings.enabled);
      })
      .catch((e: unknown) => { if (active) setError(errorMessage(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api]);

  async function save() {
    const { value, error: addressError } = validateGroceryAddress(origin);
    if (!value) { setError(`Ship-from address: ${addressError}`); return; }
    if (!pickupInstructions.trim()) { setError('Enter a pickup note.'); return; }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await api('/grocery/admin/settings', {
        method: 'PUT', body: JSON.stringify({ origin: value, pickupInstructions: pickupInstructions.trim(), enabled }),
      });
      setNotice(enabled ? 'Saved. The grocery store is open to customers.' : 'Saved. The grocery store is closed to customers.');
    } catch (e) { setError(errorMessage(e)); }
    finally { setSaving(false); }
  }

  if (loading) return <ActivityIndicator style={s.loader} />;
  return <View style={s.card}>
    <Text style={s.cardTitle}>Store settings</Text>
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {notice ? <Text style={s.notice}>{notice}</Text> : null}
    <View style={s.switchRow}>
      <View style={s.flex}>
        <Text style={s.bold}>Store open</Text>
        <Text style={s.muted}>Customers can only buy while the store is open.</Text>
      </View>
      <Switch accessibilityLabel="Store open" value={enabled} onValueChange={setEnabled} />
    </View>
    <Text style={s.bold}>Ship-from address</Text>
    <Text style={s.muted}>Used to calculate carrier rates. It is encrypted and never shown to customers.</Text>
    <AddressFields value={origin} onChange={setOrigin} />
    <Field label="Pickup note" value={pickupInstructions} onChange={setPickupInstructions} multiline />
    <PrimaryButton label="Save settings" loading={saving} onPress={() => void save()} />
  </View>;
}

function toForm(product: GroceryAdminProduct): ProductForm {
  return {
    id: product.id, expectedUpdatedAt: product.updatedAt, name: product.name, description: product.description,
    ingredients: product.ingredients, allergenNotice: product.allergenNotice, imageUrl: product.imageUrl,
    price: (product.priceCents / 100).toFixed(2), stock: String(product.stock), weightOz: String(product.weightOz),
    lengthIn: String(product.lengthIn), widthIn: String(product.widthIn), heightIn: String(product.heightIn),
    taxCode: product.taxCode, active: product.active,
  };
}

function Products({ api, apiBaseUrl, token }: { api: Api; apiBaseUrl: string; token: string }) {
  const [products, setProducts] = useState<GroceryAdminProduct[]>([]);
  const [form, setForm] = useState<ProductForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'save' | 'photo' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setProducts(await api<GroceryAdminProduct[]>('/grocery/admin/products', { cache: 'no-store' })); }
    catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); }
  }, [api]);
  useEffect(() => {
    let active = true;
    void api<GroceryAdminProduct[]>('/grocery/admin/products', { cache: 'no-store' })
      .then((next) => { if (active) setProducts(next); })
      .catch((e: unknown) => { if (active) setError(errorMessage(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api]);

  const set = (key: keyof ProductForm) => (text: string) => setForm((current) => current && { ...current, [key]: text });

  async function choosePhoto() {
    setBusy('photo');
    setError(null);
    try {
      const uri = await pickProfilePhoto(false);
      if (!uri) return;
      const { imageUrl } = await uploadGroceryProductPhoto(apiBaseUrl, token, uri);
      setForm((current) => current && { ...current, imageUrl });
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(null); }
  }

  async function save() {
    if (!form) return;
    const priceCents = dollarsToCents(form.price);
    const stock = Number(form.stock);
    const numbers = [form.weightOz, form.lengthIn, form.widthIn, form.heightIn].map(Number);
    if (!form.name.trim() || !form.description.trim() || !form.ingredients.trim() || !form.allergenNotice.trim()) {
      setError('Enter the name, description, ingredients and allergen notice.'); return;
    }
    if (!priceCents) { setError('Enter a price such as 12.99.'); return; }
    if (!Number.isInteger(stock) || stock < 0) { setError('Stock must be a whole number.'); return; }
    if (numbers.some((n) => !Number.isFinite(n) || n <= 0)) { setError('Enter the packed weight and box size.'); return; }
    if (!/^txcd_\d{8}$/.test(form.taxCode.trim())) { setError('Enter a Stripe tax code such as txcd_00000000.'); return; }
    setBusy('save');
    setError(null);
    try {
      await api(form.id ? `/grocery/admin/products/${form.id}` : '/grocery/admin/products', {
        method: form.id ? 'PUT' : 'POST',
        body: JSON.stringify({
          name: form.name.trim(), description: form.description.trim(), ingredients: form.ingredients.trim(),
          allergenNotice: form.allergenNotice.trim(), imageUrl: form.imageUrl, priceCents, stock,
          weightOz: numbers[0], lengthIn: numbers[1], widthIn: numbers[2], heightIn: numbers[3],
          taxCode: form.taxCode.trim(), active: form.active,
          ...(form.id ? { expectedUpdatedAt: form.expectedUpdatedAt } : {}),
        }),
      });
      setForm(null);
      await load();
    } catch (e) {
      setError(errorMessage(e));
      if (form.id) void load();
    } finally { setBusy(null); }
  }

  if (form) return <View style={s.card}>
    <Text style={s.cardTitle}>{form.id ? 'Edit product' : 'New product'}</Text>
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {form.imageUrl ? <Image source={{ uri: form.imageUrl }} style={s.image} accessibilityLabel="Product photo" /> : null}
    <View style={s.row}>
      <PrimaryButton label={form.imageUrl ? 'Change photo' : 'Add photo'} secondary loading={busy === 'photo'} onPress={() => void choosePhoto()} />
      {form.imageUrl ? <PrimaryButton label="Remove photo" secondary onPress={() => setForm({ ...form, imageUrl: null })} /> : null}
    </View>
    <Field label="Name" value={form.name} onChange={set('name')} maxLength={120} />
    <Field label="Description" value={form.description} onChange={set('description')} multiline />
    <Field label="Ingredients" value={form.ingredients} onChange={set('ingredients')} multiline />
    <Field label="Allergen notice" value={form.allergenNotice} onChange={set('allergenNotice')} multiline
      placeholder="Contains fish. Packed in a facility that handles peanuts." />
    <View style={s.row}>
      <View style={s.flex}><Field label="Price (USD)" value={form.price} onChange={set('price')} keyboardType="decimal-pad" placeholder="12.99" /></View>
      <View style={s.flex}><Field label="Stock" value={form.stock} onChange={set('stock')} keyboardType="number-pad" /></View>
    </View>
    <Text style={s.muted}>Packed parcel size — each unit ships as its own parcel for carrier rates.</Text>
    <View style={s.row}>
      <View style={s.flex}><Field label="Weight (oz)" value={form.weightOz} onChange={set('weightOz')} keyboardType="decimal-pad" /></View>
      <View style={s.flex}><Field label="Length (in)" value={form.lengthIn} onChange={set('lengthIn')} keyboardType="decimal-pad" /></View>
    </View>
    <View style={s.row}>
      <View style={s.flex}><Field label="Width (in)" value={form.widthIn} onChange={set('widthIn')} keyboardType="decimal-pad" /></View>
      <View style={s.flex}><Field label="Height (in)" value={form.heightIn} onChange={set('heightIn')} keyboardType="decimal-pad" /></View>
    </View>
    <Field label="Stripe tax code" value={form.taxCode} onChange={set('taxCode')} placeholder="txcd_00000000" maxLength={13} />
    <View style={s.switchRow}>
      <Text style={[s.bold, s.flex]}>Visible to customers</Text>
      <Switch accessibilityLabel="Visible to customers" value={form.active} onValueChange={(active) => setForm({ ...form, active })} />
    </View>
    <PrimaryButton label="Save product" loading={busy === 'save'} disabled={busy === 'photo'} onPress={() => void save()} />
    <PrimaryButton label="Cancel" secondary onPress={() => { setForm(null); setError(null); }} />
  </View>;

  return <View style={s.stack}>
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    <PrimaryButton label="Add product" onPress={() => { setError(null); setForm(emptyProduct); }} />
    {loading ? <ActivityIndicator style={s.loader} /> : !products.length
      ? <Text style={s.muted}>No products yet. Add your first product, then open the store in Store settings.</Text>
      : products.map((product) => (
        <Pressable key={product.id} accessibilityRole="button" accessibilityLabel={`Edit ${product.name}`}
          onPress={() => { setError(null); setForm(toForm(product)); }} style={s.card}>
          <View style={s.row}>
            {product.imageUrl ? <Image source={{ uri: product.imageUrl }} style={s.thumb} /> : null}
            <View style={s.flex}>
              <Text style={s.cardTitle}>{product.name}</Text>
              <Text style={s.muted}>{formatCents(product.priceCents)} · {product.stock} in stock · {product.active ? 'Visible' : 'Hidden'}</Text>
            </View>
            <Text style={s.link}>Edit</Text>
          </View>
        </Pressable>
      ))}
  </View>;
}

function Orders({ api }: { api: Api }) {
  const [orders, setOrders] = useState<GroceryOrder[]>([]);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await api<GroceryOrder[]>('/grocery/admin/orders', { cache: 'no-store' });
      setError(null);
      setOrders(next);
    }
    catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); }
  }, [api]);
  useEffect(() => {
    let active = true;
    void api<GroceryOrder[]>('/grocery/admin/orders', { cache: 'no-store' })
      .then((next) => { if (active) setOrders(next); })
      .catch((e: unknown) => { if (active) setError(errorMessage(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api]);

  const visible = orders.filter((order) => filter === 'all' || order.status === 'paid' || order.status === 'awaiting_payment');
  return <View style={s.stack}>
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    <View style={s.row}>
      {(['open', 'all'] as const).map((value) => (
        <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: filter === value }}
          onPress={() => setFilter(value)} style={[s.chip, filter === value && s.chipActive]}>
          <Text style={[s.chipText, filter === value && s.chipTextActive]}>{value === 'open' ? 'Needs action' : 'All orders'}</Text>
        </Pressable>
      ))}
      <View style={s.flex} />
      <Pressable accessibilityRole="button" onPress={() => void load()}><Text style={s.link}>Refresh</Text></Pressable>
    </View>
    {loading ? <ActivityIndicator style={s.loader} /> : !visible.length
      ? <Text style={s.muted}>No grocery orders need action.</Text>
      : visible.map((order) => <OrderCard key={order.id} order={order} api={api}
        onUpdated={(updated) => setOrders((items) => items.map((item) => item.id === updated.id ? { ...item, ...updated } : item))}
        onReload={() => void load()} />)}
  </View>;
}

function OrderCard({ order, api, onUpdated, onReload }: {
  order: GroceryOrder; api: Api; onUpdated: (order: GroceryOrder) => void; onReload: () => void;
}) {
  const [address, setAddress] = useState<GroceryAddress | null>(null);
  const [tracking, setTracking] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const hideAddress = useCallback(() => { generation.current += 1; setAddress(null); }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state !== 'active') hideAddress(); });
    return () => { generation.current += 1; subscription.remove(); };
  }, [hideAddress]);

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try { await action(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(null); }
  }

  return <View style={s.card}>
    <View style={s.row}>
      <Text style={[s.cardTitle, s.flex]}>Order {order.id.slice(0, 8).toUpperCase()}</Text>
      <Text style={s.muted}>{new Date(order.createdAt).toLocaleString()}</Text>
    </View>
    <Text style={s.status}>{groceryStatusLabels[order.status]}</Text>
    {order.items.map((item) => <Text key={item.id} style={s.body}>{item.quantity} × {item.name}</Text>)}
    <Text style={s.muted}>
      Subtotal {formatCents(order.subtotalCents)}
      {order.shippingCents != null ? ` · shipping ${formatCents(order.shippingCents)}` : ''}
      {order.taxCents != null ? ` · tax ${formatCents(order.taxCents)}` : ''}
      {order.totalCents != null ? ` · total ${formatCents(order.totalCents)}` : ''}
    </Text>
    {order.shippingService ? <Text style={s.muted}>Service: {order.shippingService}</Text> : null}
    {order.trackingNumber ? <Text selectable style={s.bold}>Tracking: {order.trackingNumber}</Text> : null}
    {order.lastError ? <Text style={s.muted}>{order.lastError}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}

    {address ? <View style={s.address}>
      <Text selectable style={s.body}>{address.name}{'\n'}{address.street1}{address.street2 ? `\n${address.street2}` : ''}
        {'\n'}{address.city}, {address.state} {address.zip}{'\n'}{address.phone}</Text>
      <Pressable accessibilityRole="button" onPress={hideAddress}><Text style={s.link}>Hide address</Text></Pressable>
    </View> : order.status === 'paid' ? (
      <PrimaryButton label="Show shipping address" secondary loading={busy === 'address'} onPress={() => void run('address', async () => {
        const current = ++generation.current;
        const result = await api<GroceryAddress | null>(`/grocery/admin/orders/${order.id}/address`, { cache: 'no-store' });
        if (current === generation.current) setAddress(result);
      })} />
    ) : null}

    {order.status === 'paid' ? <>
      <Field label="Carrier tracking number" value={tracking} onChange={setTracking} maxLength={120} />
      <PrimaryButton label="Mark shipped" loading={busy === 'fulfill'} disabled={!tracking.trim()} onPress={() => void run('fulfill', async () => {
        await api(`/grocery/admin/orders/${order.id}/fulfill`, { method: 'PATCH', body: JSON.stringify({ trackingNumber: tracking.trim() }) });
        hideAddress();
        onReload();
      })} />
    </> : null}

    {order.status === 'awaiting_payment' ? <>
      <Field label="Stripe checkout session ID (only if the order has none)" value={sessionId} onChange={setSessionId} placeholder="cs_live_…" />
      <PrimaryButton label="Check payment with Stripe" secondary loading={busy === 'refresh'} onPress={() => void run('refresh', async () => {
        onUpdated(await api<GroceryOrder>(`/grocery/admin/orders/${order.id}/refresh`, {
          method: 'POST', body: JSON.stringify(sessionId.trim() ? { stripeSessionId: sessionId.trim() } : {}),
        }));
      })} />
    </> : null}
  </View>;
}

const s = StyleSheet.create({
  wrap: { gap: 12 },
  stack: { gap: 12 },
  tabs: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: 12, padding: 4, gap: 4 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  tabActive: { backgroundColor: '#fff' },
  tabText: { color: '#4b5563', fontWeight: '700' },
  tabTextActive: { color: '#14532d' },
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', padding: 14, gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  flex: { flex: 1 },
  field: { gap: 4, minWidth: 120 },
  label: { fontWeight: '700', color: '#374151', fontSize: 13 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: '#111827', backgroundColor: '#fff' },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  bold: { fontWeight: '700', color: '#111827' },
  body: { color: '#374151', lineHeight: 20 },
  muted: { color: '#6b7280', fontSize: 13, lineHeight: 18 },
  status: { color: '#b45309', fontWeight: '700' },
  error: { color: '#b91c1c' },
  notice: { color: '#166534' },
  link: { color: '#166534', fontWeight: '700' },
  loader: { marginTop: 24 },
  image: { width: '100%', aspectRatio: 4 / 3, borderRadius: 10, backgroundColor: '#f3f4f6' },
  thumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#f3f4f6' },
  address: { backgroundColor: '#f9fafb', borderRadius: 10, padding: 10, gap: 6 },
  chip: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  chipActive: { backgroundColor: '#14532d', borderColor: '#14532d' },
  chipText: { color: '#374151', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
});
