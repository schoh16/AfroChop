import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, AppState, Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { marketplaceApi } from '../lib/marketplaceApi';
import {
  MAX_GROCERY_UNITS, cartSubtotalCents, cartUnits, changeCartQuantity, emptyGroceryAddress, formatCents,
  groceryStatusLabels, reconcileCart, validateGroceryAddress,
  type GroceryAddress, type GroceryCart, type GroceryCatalog, type GroceryOrder, type GroceryQuote,
} from '../lib/grocery';

type Props = { apiBaseUrl: string; token: string; onBack: () => void };
type Step = 'shop' | 'address' | 'rates' | 'orders';

const sampleIdeas = [
  { emoji: '🫙', name: 'Red oil (5, 10 & 20 L)' },
  { emoji: '🌰', name: 'Egusi, Contri onion & Akawan (limestone)' },
  { emoji: '🌶️', name: 'Achu, pepper soup, pepper & white pepper spices' },
  { emoji: '🥬', name: 'Dry eru & Okonhonbong' },
  { emoji: '🌾', name: 'White & red garri' },
  { emoji: '🐌', name: 'Dried snail & Kang Kang for soya' },
  { emoji: '🥤', name: 'Djino, Top, Vimto, Grenadine, UCB & Ananas drinks' },
];

const addressFields: { key: keyof GroceryAddress; label: string; placeholder: string; autoComplete?: 'name' | 'street-address' | 'postal-code' | 'tel' }[] = [
  { key: 'name', label: 'Recipient name', placeholder: 'Full name', autoComplete: 'name' },
  { key: 'street1', label: 'Street address', placeholder: '123 Main Street', autoComplete: 'street-address' },
  { key: 'street2', label: 'Apartment, suite (optional)', placeholder: 'Apt 4B' },
  { key: 'city', label: 'City', placeholder: 'City' },
  { key: 'state', label: 'State', placeholder: 'MD' },
  { key: 'zip', label: 'ZIP code', placeholder: '21201', autoComplete: 'postal-code' },
  { key: 'phone', label: 'Phone (for the carrier)', placeholder: '(410) 555-0100', autoComplete: 'tel' },
];

export function GroceryStore({ apiBaseUrl, token, onBack }: Props) {
  const request = useMemo(() => marketplaceApi(apiBaseUrl, token), [apiBaseUrl, token]);
  const [catalog, setCatalog] = useState<GroceryCatalog | null>(null);
  const [cart, setCart] = useState<GroceryCart>({});
  const [step, setStep] = useState<Step>('shop');
  // The shipping address only lives in component memory and is never persisted on the device.
  const [address, setAddress] = useState<GroceryAddress>(emptyGroceryAddress);
  const [quote, setQuote] = useState<GroceryQuote | null>(null);
  const [rateId, setRateId] = useState<string | null>(null);
  const [orders, setOrders] = useState<GroceryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadCatalog = useCallback(async () => {
    try {
      const next = await request<GroceryCatalog>('/grocery');
      setError(null);
      setCatalog(next);
      setCart((current) => reconcileCart(current, next.products));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the grocery store.');
    } finally {
      setLoading(false);
    }
  }, [request]);

  const loadOrders = useCallback(async () => {
    try {
      setOrders(await request<GroceryOrder[]>('/grocery/orders/mine'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your grocery orders.');
    }
  }, [request]);

  useEffect(() => {
    let active = true;
    void request<GroceryCatalog>('/grocery').then((next) => {
      if (!active) return;
      setCatalog(next);
      setCart((current) => reconcileCart(current, next.products));
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : 'Could not load the grocery store.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [request]);
  useEffect(() => {
    if (step !== 'orders') return;
    let active = true;
    const fetchOrders = () => request<GroceryOrder[]>('/grocery/orders/mine').then((next) => {
      if (active) setOrders(next);
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : 'Could not load your grocery orders.');
    });
    void fetchOrders();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void fetchOrders();
    });
    return () => { active = false; subscription.remove(); };
  }, [request, step]);

  const products = catalog?.products ?? [];
  const units = cartUnits(cart);
  const subtotal = cartSubtotalCents(cart, products);
  const selectedRate = quote?.rates.find((rate) => rate.id === rateId) ?? null;

  async function getRates() {
    const { value, error: addressError } = validateGroceryAddress(address);
    if (!value) { setError(addressError ?? 'Check the shipping address.'); return; }
    setBusy('rates');
    setError(null);
    try {
      const next = await request<GroceryQuote>('/grocery/quotes', {
        method: 'POST',
        body: JSON.stringify({
          fulfillment: 'shipping',
          destination: value,
          items: Object.entries(cart).map(([productId, quantity]) => ({ productId, quantity })),
        }),
      });
      setQuote(next);
      setRateId(next.rates[0]?.id ?? null);
      setStep('rates');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not get shipping rates.');
      void loadCatalog();
    } finally {
      setBusy(null);
    }
  }

  async function pay() {
    if (!quote || !rateId) return;
    setBusy('pay');
    setError(null);
    try {
      const { url } = await request<{ orderId: string; url: string }>(`/grocery/orders/${quote.id}/checkout`, {
        method: 'POST', body: JSON.stringify({ rateId }),
      });
      setCart({});
      setQuote(null);
      setRateId(null);
      setAddress(emptyGroceryAddress);
      setNotice('Finish payment in the secure Stripe page. Your order appears below once it is paid.');
      setStep('orders');
      await Linking.openURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open checkout.');
    } finally {
      setBusy(null);
    }
  }

  async function refreshOrder(id: string) {
    setBusy(id);
    setError(null);
    try {
      const updated = await request<GroceryOrder>(`/grocery/orders/${id}/refresh`, { method: 'POST' });
      setOrders((current) => current.map((order) => (order.id === id ? updated : order)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not refresh the order.');
    } finally {
      setBusy(null);
    }
  }

  function back() {
    setError(null);
    if (step === 'rates') setStep('address');
    else if (step === 'address' || step === 'orders') setStep('shop');
    else onBack();
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={back} hitSlop={8}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>🛒 AfroChop Groceries</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={step === 'orders' ? 'Back to the store' : 'View my grocery orders'}
          onPress={() => { setError(null); setStep(step === 'orders' ? 'shop' : 'orders'); }}
          hitSlop={8}
        >
          <Text style={styles.back}>{step === 'orders' ? 'Shop' : 'My orders'}</Text>
        </Pressable>
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="on-drag">
        {step === 'shop' ? (
          loading && !catalog ? <ActivityIndicator style={styles.loader} color="#c2410c" /> : (
            <>
              <Text style={styles.intro}>
                African pantry staples sold and shipped by AfroChop. Orders ship anywhere in the US with tracking.
              </Text>
              {!catalog?.open || !products.length ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>{catalog?.open ? 'New products are on the way' : 'The grocery store is closed right now'}</Text>
                  <Text style={styles.detail}>Check back soon. Here is a preview of what we plan to stock:</Text>
                  {sampleIdeas.map((idea) => (
                    <Text key={idea.name} style={styles.sample}>{idea.emoji} {idea.name}</Text>
                  ))}
                  <Text style={styles.sampleNote}>Preview only — these items are not available to buy yet.</Text>
                  <Pressable accessibilityRole="button" onPress={() => void loadCatalog()} style={styles.secondary}>
                    <Text style={styles.secondaryText}>Refresh</Text>
                  </Pressable>
                </View>
              ) : products.map((product) => {
                const quantity = cart[product.id] ?? 0;
                const soldOut = product.stock < 1;
                const atLimit = quantity >= product.stock || units >= MAX_GROCERY_UNITS;
                return (
                  <View key={product.id} style={styles.card}>
                    {product.imageUrl ? (
                      <Image source={{ uri: product.imageUrl }} style={styles.image} accessibilityLabel={product.name} />
                    ) : null}
                    <View style={styles.row}>
                      <Text style={[styles.cardTitle, styles.flex]}>{product.name}</Text>
                      <Text style={styles.price}>{formatCents(product.priceCents)}</Text>
                    </View>
                    <Text style={styles.detail}>{product.description}</Text>
                    <Text style={styles.small}><Text style={styles.bold}>Ingredients: </Text>{product.ingredients}</Text>
                    {product.allergenNotice ? <Text style={styles.allergen}>⚠️ {product.allergenNotice}</Text> : null}
                    <View style={styles.row}>
                      <Text style={[styles.small, styles.flex]}>
                        {soldOut ? 'Sold out' : product.stock <= 5 ? `Only ${product.stock} left` : 'In stock'}
                      </Text>
                      {soldOut ? null : (
                        <View style={styles.stepper}>
                          <Pressable
                            accessibilityRole="button" accessibilityLabel={`Remove one ${product.name}`}
                            disabled={!quantity} onPress={() => setCart((c) => changeCartQuantity(c, product, -1))}
                            style={[styles.stepButton, !quantity && styles.disabled]}
                          >
                            <Text style={styles.stepText}>−</Text>
                          </Pressable>
                          <Text style={styles.quantity} accessibilityLabel={`${quantity} in cart`}>{quantity}</Text>
                          <Pressable
                            accessibilityRole="button" accessibilityLabel={`Add one ${product.name}`}
                            disabled={atLimit} onPress={() => setCart((c) => changeCartQuantity(c, product, 1))}
                            style={[styles.stepButton, atLimit && styles.disabled]}
                          >
                            <Text style={styles.stepText}>+</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </>
          )
        ) : null}

        {step === 'address' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Ship to</Text>
            <Text style={styles.small}>US addresses only. Your address is shared only with AfroChop and the carrier.</Text>
            {addressFields.map((field) => (
              <View key={field.key} style={styles.field}>
                <Text style={styles.label}>{field.label}</Text>
                <TextInput
                  accessibilityLabel={field.label}
                  value={address[field.key] ?? ''}
                  onChangeText={(text) => setAddress((current) => ({ ...current, [field.key]: text }))}
                  placeholder={field.placeholder}
                  placeholderTextColor="#a8a29e"
                  autoComplete={field.autoComplete}
                  autoCapitalize={field.key === 'state' ? 'characters' : 'words'}
                  maxLength={field.key === 'state' ? 2 : field.key === 'zip' ? 10 : 200}
                  keyboardType={field.key === 'zip' ? 'number-pad' : field.key === 'phone' ? 'phone-pad' : 'default'}
                  style={styles.input}
                />
              </View>
            ))}
            <Pressable
              accessibilityRole="button" disabled={busy === 'rates'} onPress={() => void getRates()}
              style={[styles.primary, busy === 'rates' && styles.disabled]}
            >
              {busy === 'rates' ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>See shipping options</Text>}
            </Pressable>
          </View>
        ) : null}

        {step === 'rates' && quote ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Choose shipping</Text>
            {quote.items.map((item) => (
              <Text key={item.id} style={styles.detail}>{item.quantity} × {item.name} · {formatCents(item.priceCents * item.quantity)}</Text>
            ))}
            {quote.rates.length ? quote.rates.map((rate) => (
              <Pressable
                key={rate.id} accessibilityRole="radio" accessibilityState={{ checked: rate.id === rateId }}
                onPress={() => setRateId(rate.id)} style={[styles.rate, rate.id === rateId && styles.rateSelected]}
              >
                <Text style={[styles.flex, styles.detail]}>
                  {rate.service}{rate.estimatedDays ? ` · about ${rate.estimatedDays} day${rate.estimatedDays === 1 ? '' : 's'}` : ''}
                </Text>
                <Text style={styles.bold}>{formatCents(rate.amountCents)}</Text>
              </Pressable>
            )) : <Text style={styles.detail}>No carrier can ship to this address. Check it and try again.</Text>}
            <Text style={styles.small}>Subtotal {formatCents(quote.subtotalCents)} · shipping {formatCents(selectedRate?.amountCents)} · sales tax is calculated at checkout.</Text>
            <Text style={styles.small}>This quote is held for 10 minutes.</Text>
            <Pressable
              accessibilityRole="button" disabled={!selectedRate || busy === 'pay'} onPress={() => void pay()}
              style={[styles.primary, (!selectedRate || busy === 'pay') && styles.disabled]}
            >
              {busy === 'pay' ? <ActivityIndicator color="#fff" /> : (
                <Text style={styles.primaryText}>Pay {formatCents(quote.subtotalCents + (selectedRate?.amountCents ?? 0))} + tax</Text>
              )}
            </Pressable>
          </View>
        ) : null}

        {step === 'orders' ? (
          <>
            {notice ? <Text style={styles.notice}>{notice}</Text> : null}
            <Pressable accessibilityRole="button" onPress={() => void loadOrders()} style={styles.secondary}>
              <Text style={styles.secondaryText}>Refresh orders</Text>
            </Pressable>
            {!orders.length ? <Text style={styles.empty}>You have no grocery orders yet.</Text> : orders.map((order) => {
              const resumable = order.status === 'awaiting_payment' && order.checkoutUrl
                && (!order.checkoutExpiresAt || new Date(order.checkoutExpiresAt) > new Date());
              return (
                <View key={order.id} style={styles.card}>
                  <View style={styles.row}>
                    <Text style={[styles.cardTitle, styles.flex]}>Order {order.id.slice(0, 8).toUpperCase()}</Text>
                    <Text style={styles.small}>{new Date(order.createdAt).toLocaleDateString()}</Text>
                  </View>
                  <Text style={styles.status}>{groceryStatusLabels[order.status]}</Text>
                  {order.items.map((item) => (
                    <Text key={item.id} style={styles.detail}>{item.quantity} × {item.name}</Text>
                  ))}
                  <Text style={styles.detail}>
                    {order.totalCents != null ? `Total ${formatCents(order.totalCents)}` : `Subtotal ${formatCents(order.subtotalCents)}`}
                    {order.shippingService ? ` · ${order.shippingService}` : ''}
                  </Text>
                  {order.trackingNumber ? (
                    <Text selectable style={styles.tracking}>Tracking number: {order.trackingNumber}</Text>
                  ) : null}
                  {order.lastError && order.status !== 'paid' && order.status !== 'fulfilled'
                    ? <Text style={styles.small}>{order.lastError}</Text> : null}
                  <View style={styles.actions}>
                    {resumable ? (
                      <Pressable accessibilityRole="button" onPress={() => void Linking.openURL(order.checkoutUrl!)} style={[styles.primary, styles.flex]}>
                        <Text style={styles.primaryText}>Finish payment</Text>
                      </Pressable>
                    ) : null}
                    {order.status === 'awaiting_payment' ? (
                      <Pressable
                        accessibilityRole="button" disabled={busy === order.id} onPress={() => void refreshOrder(order.id)}
                        style={[styles.secondary, styles.flex, busy === order.id && styles.disabled]}
                      >
                        <Text style={styles.secondaryText}>Check payment</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </>
        ) : null}
      </ScrollView>
      {step === 'shop' && units > 0 ? (
        <View style={styles.cartBar}>
          <View style={styles.flex}>
            <Text style={styles.cartText}>{units} item{units === 1 ? '' : 's'} · {formatCents(subtotal)}</Text>
            <Text style={styles.cartHint}>Up to {MAX_GROCERY_UNITS} items per order</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => { setError(null); setStep('address'); }} style={styles.cartButton}>
            <Text style={styles.cartButtonText}>Checkout</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff7ed' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#fed7aa', backgroundColor: '#fff',
  },
  back: { color: '#c2410c', fontWeight: '700', fontSize: 16 },
  title: { flex: 1, fontSize: 18, fontWeight: '800', color: '#431407', textAlign: 'center' },
  error: { color: '#b91c1c', paddingHorizontal: 16, paddingTop: 12 },
  notice: { color: '#166534', backgroundColor: '#dcfce7', borderRadius: 10, padding: 10 },
  loader: { marginTop: 32 },
  list: { padding: 16, gap: 12, paddingBottom: 32 },
  intro: { color: '#7c2d12', lineHeight: 20 },
  empty: { color: '#7c2d12', textAlign: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#fed7aa', padding: 14, gap: 8 },
  cardTitle: { fontWeight: '800', color: '#431407', fontSize: 16 },
  image: { width: '100%', aspectRatio: 4 / 3, borderRadius: 10, backgroundColor: '#ffedd5' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  price: { fontSize: 18, fontWeight: '800', color: '#c2410c' },
  detail: { color: '#57534e', lineHeight: 20 },
  small: { color: '#78716c', fontSize: 13, lineHeight: 18 },
  bold: { fontWeight: '700', color: '#431407' },
  allergen: { color: '#92400e', fontSize: 13, backgroundColor: '#fef3c7', borderRadius: 8, padding: 8 },
  sample: { color: '#431407', fontSize: 15 },
  sampleNote: { color: '#92400e', fontStyle: 'italic', fontSize: 13 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#c2410c', alignItems: 'center', justifyContent: 'center' },
  stepText: { color: '#fff', fontSize: 20, fontWeight: '800', lineHeight: 22 },
  quantity: { minWidth: 20, textAlign: 'center', fontWeight: '800', color: '#431407', fontSize: 16 },
  disabled: { opacity: 0.4 },
  field: { gap: 4 },
  label: { color: '#431407', fontWeight: '700', fontSize: 13 },
  input: {
    borderWidth: 1, borderColor: '#fed7aa', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 16, color: '#1c1917', backgroundColor: '#fffbf5',
  },
  primary: { backgroundColor: '#c2410c', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  secondary: { borderWidth: 1, borderColor: '#c2410c', borderRadius: 10, padding: 12, alignItems: 'center' },
  secondaryText: { color: '#c2410c', fontWeight: '800' },
  rate: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#fed7aa', borderRadius: 10, padding: 12 },
  rateSelected: { borderColor: '#c2410c', borderWidth: 2, backgroundColor: '#fff7ed' },
  status: { color: '#c2410c', fontWeight: '700' },
  tracking: { color: '#166534', fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10 },
  cartBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: '#431407',
  },
  cartText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  cartHint: { color: '#fed7aa', fontSize: 12 },
  cartButton: { backgroundColor: '#f97316', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 18 },
  cartButtonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
