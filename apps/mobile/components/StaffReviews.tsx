import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PrimaryButton } from './AuthUi';
import { SelectionDropdown } from './SelectionDropdown';
import { marketplaceApi } from '../lib/marketplaceApi';
import type { AdminApplication } from '../lib/adminApplications';

type ReviewStatus = 'verified' | 'needs_more_info' | 'rejected';
type ReviewItem = { id: string; title: string; status: string; path: string; method: 'PATCH' | 'PUT';
  serviceType?: string; jurisdictionCode?: string; permit?: boolean; userVerification?: boolean };
type VerificationQueue = {
  userVerifications: { id: string; userId: string; type: string; status: string;
    provider: string | null; providerReference: string | null; user: { name: string; email: string } }[];
  credentials: { id: string; name: string; status: string; issuer: string | null; providerReference: string | null;
    expiresAt: string | null; chef: { displayName: string } }[];
  permits: { id: string; permitType: string; jurisdictionCode: string; expiresAt: string | null; chef: { displayName: string } }[];
  serviceApprovals: { id: string; chefId: string; serviceType: string; jurisdictionCode: string; status: string;
    chef: { displayName: string } }[];
};
type Payment = { id: string; bookingId: string; grossCents: number; currency: string; refundedCents: number;
  payoutStatus: string; lastError: string | null; disputeOpen: boolean;
  refund: { status: string; reason: string; reviewerNotes: string | null } | null };
type Decision = { label: string; path: string; method: string; body: object };
const serviceTypes = ['prepared_meals', 'bulk_meal_prep', 'in_home_cooking', 'special_event', 'postpartum', 'recurring'];
const message = (error: unknown) => error instanceof Error ? error.message : 'Staff review failed. Please try again.';

export function StaffReviews({ api, applications }: {
  api: ReturnType<typeof marketplaceApi>; applications: AdminApplication[];
}) {
  const [queue, setQueue] = useState<VerificationQueue | null>(null);
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReviewItem | null>(null);
  const [notes, setNotes] = useState('');
  const [refundNotes, setRefundNotes] = useState<Record<string, string>>({});
  const scroll = useRef<ScrollView>(null);
  const [provider, setProvider] = useState('');
  const [reference, setReference] = useState('');
  const [decision, setDecision] = useState<Decision | null>(null);
  const [chefId, setChefId] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [jurisdiction, setJurisdiction] = useState('');
  const fetchQueues = useCallback(() => Promise.all([
    api<VerificationQueue>('/admin/verification/queue', { cache: 'no-store' }),
    api<Payment[]>('/payments/admin/bookings', { cache: 'no-store' }),
  ]), [api]);

  useEffect(() => {
    let active = true;
    void fetchQueues().then(([verification, money]) => {
      if (active) { setQueue(verification); setPayments(money); }
    }).catch((error: unknown) => { if (active) setError(message(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fetchQueues]);

  async function refresh() {
    setLoading(true); setError(null);
    try {
      const [verification, money] = await fetchQueues();
      setQueue(verification); setPayments(money);
    } catch (error) { setQueue(null); setPayments(null); setError(message(error)); }
    finally { setLoading(false); }
  }
  async function submitDecision() {
    if (!decision) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await api(decision.path, { method: decision.method, body: JSON.stringify(decision.body) });
      setDecision(null); setSelected(null); setNotes(''); setProvider(''); setReference('');
      setNotice('Decision submitted. Check the refreshed status; a refund may still be processing in Stripe.');
      await refresh();
    } catch (error) { setDecision(null); setError(message(error)); }
    finally { setBusy(false); }
  }
  function confirmDecision(value: Decision) {
    setDecision(value);
    scroll.current?.scrollTo({ y: 0, animated: true });
  }
  function prepareReview(status: ReviewStatus) {
    if (!selected) return;
    confirmDecision({
      label: `${status.replaceAll('_', ' ')}: ${selected.title}`,
      path: selected.path, method: selected.method,
      body: selected.permit ? { approved: status === 'verified', reviewerNotes: notes.trim() } : {
        status, reviewerNotes: notes.trim(),
        ...(selected.serviceType ? { serviceType: selected.serviceType, jurisdictionCode: selected.jurisdictionCode } : {}),
        ...(selected.userVerification ? { provider: provider.trim() || undefined, providerReference: reference.trim() || undefined } : {}),
      },
    });
  }
  const items: ReviewItem[] = queue ? [
    ...queue.userVerifications.map((item): ReviewItem => ({
      id: item.id, title: `${item.user.name} (${item.user.email}) - ${item.type}; evidence: ${item.provider ?? 'none'} / ${item.providerReference ?? 'none'}`,
      status: item.status, path: `/admin/verification/users/${item.userId}/${item.type}`, method: 'PATCH', userVerification: true,
    })),
    ...queue.credentials.map((item): ReviewItem => ({
      id: item.id, title: `${item.chef.displayName} - ${item.name}; issuer: ${item.issuer ?? 'none'}; reference: ${item.providerReference ?? 'none'}; expires: ${item.expiresAt ?? 'not recorded'}`,
      status: item.status, path: `/admin/verification/credentials/${item.id}`, method: 'PATCH',
    })),
    ...queue.permits.map((item): ReviewItem => ({
      id: item.id, title: `${item.chef.displayName} - ${item.permitType} (${item.jurisdictionCode}); expires: ${item.expiresAt ?? 'not recorded'}`,
      status: 'Permit review', path: `/admin/safety/permits/${item.id}/review`, method: 'PATCH', permit: true,
    })),
    ...queue.serviceApprovals.filter((item) => item.serviceType !== 'grocery_shopping').map((item): ReviewItem => ({
      id: item.id, title: `${item.chef.displayName} - ${item.serviceType} (${item.jurisdictionCode})`,
      status: item.status, path: `/admin/verification/chefs/${item.chefId}/services`, method: 'PUT',
      serviceType: item.serviceType, jurisdictionCode: item.jurisdictionCode,
    })),
  ] : [];

  return <ScrollView ref={scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <Text style={s.title}>Verification and refund reviews</Text>
    <Text style={s.text}>Publication alone does not approve a cook for every service. Verify evidence and jurisdiction rules before making a decision. Do not enter raw identity documents or private addresses in notes.</Text>
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {notice ? <Text accessibilityRole="alert" style={s.text}>{notice}</Text> : null}
    <PrimaryButton label="Refresh staff reviews" secondary disabled={busy || loading} onPress={() => { setDecision(null); setSelected(null); void refresh(); }} />
    {loading ? <ActivityIndicator /> : null}
    {decision ? <View style={s.card}>
      <Text style={s.title}>Confirm decision</Text>
      <Text style={s.text}>{decision.label}</Text>
      <Text style={s.text}>This action is audited. Approving a refund may submit a full refund to Stripe; do not confirm unless authorized.</Text>
      <PrimaryButton label="Confirm staff decision" loading={busy} onPress={() => void submitDecision()} />
      <PrimaryButton label="Cancel decision" secondary disabled={busy} onPress={() => setDecision(null)} />
    </View> : null}
    <Text style={s.title}>Verification queue</Text>
    {!loading && queue && !items.length ? <Text style={s.text}>No pending verification reviews.</Text> : null}
    {items.map((item) => <View key={item.id} style={s.card}>
      <Text style={s.text}>{item.title}</Text><Text style={s.text}>{item.status}</Text>
      <PrimaryButton label={`Review ${item.title}`} secondary disabled={busy || Boolean(decision)} onPress={() => {
        setSelected(item); setNotes(''); setProvider(''); setReference(''); setError(null);
      }} />
    </View>)}
    {selected && !decision ? <View style={s.card}>
      <Text style={s.title}>{selected.title}</Text>
      <TextInput accessibilityLabel="Verification review notes" multiline maxLength={2000} value={notes} onChangeText={setNotes} style={s.input} />
      {selected.userVerification ? <>
        <TextInput accessibilityLabel="Verification provider" maxLength={120} value={provider} onChangeText={setProvider} style={s.input} />
        <TextInput accessibilityLabel="Verification provider reference" maxLength={255} value={reference} onChangeText={setReference} style={s.input} />
      </> : null}
      {(['verified', 'needs_more_info', 'rejected'] as const).filter((status) => !selected.permit || status !== 'needs_more_info').map((status) =>
        <PrimaryButton key={status} label={status.replaceAll('_', ' ')} secondary disabled={busy || notes.trim().length < 10}
          onPress={() => prepareReview(status)} />)}
    </View> : null}
    {queue ? <View style={s.card}>
      <Text style={s.title}>Service / jurisdiction approval</Text>
      <SelectionDropdown label="Cook to review" emptyLabel="Select cook" emptyMessage="No cook applications loaded."
        selectedKeys={chefId ? [chefId] : []} options={applications.map((item) => ({ key: item.chef.id, label: item.chef.displayName }))}
        disabled={busy || Boolean(decision)} onSelect={setChefId} />
      <SelectionDropdown label="Service to review" emptyLabel="Select service" emptyMessage="No services available."
        selectedKeys={serviceType ? [serviceType] : []} options={serviceTypes.map((key) => ({ key, label: key.replaceAll('_', ' ') }))}
        disabled={busy || Boolean(decision)} onSelect={setServiceType} />
      <TextInput accessibilityLabel="Service jurisdiction code" placeholder="For example US-MD" maxLength={16}
        editable={!busy && !decision} value={jurisdiction} onChangeText={(value) => setJurisdiction(value.toUpperCase())} style={s.input} />
      <PrimaryButton label="Review selected cook service" secondary disabled={busy || Boolean(decision) || !chefId || !serviceType || jurisdiction.trim().length < 2}
        onPress={() => {
          setNotes(''); setSelected({ id: chefId, title: `${serviceType} in ${jurisdiction.trim()}`, status: 'Review',
            path: `/admin/verification/chefs/${chefId}/services`, method: 'PUT', serviceType, jurisdictionCode: jurisdiction.trim() });
        }} />
    </View> : null}
    <Text style={s.title}>Booking payments and refunds</Text>
    <Text style={s.text}>Latest 100 booking payments. Approvals can remain queued while Stripe processes a refund.</Text>
    {!loading && payments && !payments.length ? <Text style={s.text}>No booking payments recorded.</Text> : null}
    {payments?.map((payment) => <View key={payment.id} style={s.card}>
      <Text style={s.text}>Booking: {payment.bookingId}</Text>
      <Text style={s.text}>{payment.currency.toUpperCase()} {(payment.grossCents / 100).toFixed(2)}; payout: {payment.payoutStatus}; refunded: {(payment.refundedCents / 100).toFixed(2)}</Text>
      {payment.disputeOpen ? <Text style={s.error}>Open dispute. Resolve in Stripe before refunding.</Text> : null}
      {payment.lastError ? <Text style={s.error}>{payment.lastError}</Text> : null}
      {payment.refund ? <>
        <Text style={s.text}>Refund: {payment.refund.status}. Reason: {payment.refund.reason}</Text>
        <Text style={s.text}>Review notes: {payment.refund.reviewerNotes ?? 'Not recorded'}</Text>
        {['requested', 'approved'].includes(payment.refund.status) ? <>
          <TextInput accessibilityLabel={`Refund notes for ${payment.bookingId}`} multiline maxLength={2000}
            editable={!busy && !decision} value={refundNotes[payment.bookingId] ?? ''}
            onChangeText={(value) => setRefundNotes((current) => ({ ...current, [payment.bookingId]: value }))} style={s.input} />
          <PrimaryButton label={payment.refund.status === 'approved' ? 'Retry approved refund' : 'Approve full refund'}
            disabled={busy || Boolean(decision) || payment.disputeOpen || (refundNotes[payment.bookingId] ?? '').trim().length < 10}
            onPress={() => confirmDecision({ label: `Full refund for booking ${payment.bookingId}`,
              path: `/payments/admin/bookings/${payment.bookingId}/refund-review`, method: 'POST', body: { approved: true, notes: refundNotes[payment.bookingId].trim() } })} />
          {payment.refund.status === 'requested' ? <PrimaryButton label="Reject refund" secondary
            disabled={busy || Boolean(decision) || (refundNotes[payment.bookingId] ?? '').trim().length < 10}
            onPress={() => confirmDecision({ label: `Reject refund for booking ${payment.bookingId}`,
              path: `/payments/admin/bookings/${payment.bookingId}/refund-review`, method: 'POST', body: { approved: false, notes: refundNotes[payment.bookingId].trim() } })} /> : null}
        </> : null}
      </> : null}
      <PrimaryButton label="Reconcile booking payment" secondary disabled={busy || Boolean(decision)}
        onPress={() => confirmDecision({ label: `Reconcile booking ${payment.bookingId}`,
          path: `/payments/admin/bookings/${payment.bookingId}/reconcile`, method: 'POST', body: {} })} />
    </View>)}
  </ScrollView>;
}
const s = StyleSheet.create({
  content: { padding: 20, gap: 16 },
  title: { fontSize: 20, fontWeight: '700', color: '#185A43' },
  text: { fontSize: 15, lineHeight: 22, color: '#3A2E22' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 12 },
  input: { minHeight: 48, padding: 12, borderWidth: 1, borderColor: '#CFC7BC', borderRadius: 10 },
  error: { color: '#9C2F1A', padding: 12, backgroundColor: '#FDEDE7' },
});
