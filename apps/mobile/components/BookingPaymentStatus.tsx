import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

type PaymentStatus = {
  tracked: boolean;
  currency?: string;
  grossCents?: number;
  chefCents?: number;
  paidAt?: string | null;
  payoutStatus?: string;
  refundedCents?: number;
  disputeOpen?: boolean;
  lastError?: string | null;
  refund?: { status: string; reason: string; reviewerNotes: string | null } | null;
};

export function BookingPaymentStatus({
  bookingId, token, apiBaseUrl, customer, completed,
}: { bookingId: string; token: string; apiBaseUrl: string; customer: boolean; completed: boolean }) {
  const [payment, setPayment] = useState<PaymentStatus | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const call = useCallback(async (path: string, body?: object) => {
    const response = await fetch(`${apiBaseUrl}/payments/bookings/${bookingId}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(Array.isArray(result.message) ? result.message.join(' ') : result.message ?? 'Payment request failed.');
    return result;
  }, [apiBaseUrl, bookingId, token]);

  const load = useCallback(async () => {
    try {
      setPayment(await call(''));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load payment status.');
    }
  }, [call]);
  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), 10000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, [load]);

  async function act(path: string, body: object) {
    setBusy(true);
    setError(null);
    try {
      await call(path, body);
      setReason('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Payment action failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.box}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {payment?.lastError ? <Text style={styles.error}>{payment.lastError}</Text> : null}
      {payment?.tracked === false ? <Text>Legacy payment: contact support before payout or refund.</Text> : null}
      {payment?.paidAt ? (
        <>
          <Text>{customer ? 'Paid' : 'Your share'}: {payment.currency?.toUpperCase()} {((customer ? payment.grossCents ?? 0 : payment.chefCents ?? 0) / 100).toFixed(2)}</Text>
          <Text>Cook transfer: {payment.payoutStatus}. Bank payout timing is managed by Stripe.</Text>
          {payment.disputeOpen ? <Text>Dispute or lost chargeback: release blocked. Contact support.</Text> : null}
          {payment.refundedCents ? <Text>Refunded or refund processing: {(payment.refundedCents / 100).toFixed(2)}</Text> : null}
          {payment.refund ? (
            <Text>Refund review: {payment.refund.status}{payment.refund.reviewerNotes ? ` - ${payment.refund.reviewerNotes}` : ''}</Text>
          ) : null}
          {completed && payment.payoutStatus === 'held' && !payment.disputeOpen && !payment.refundedCents &&
            (!payment.refund || payment.refund.status === 'rejected') ? (
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => void act('/release', {})} style={styles.button}>
                <Text style={styles.buttonText}>Retry cook transfer</Text>
              </Pressable>
            ) : null}
          {customer && !payment.refund && !payment.refundedCents ? (
            <>
              <Text>Request a full refund for admin review. This does not guarantee approval or an immediate refund.</Text>
              <TextInput accessibilityLabel="Refund request reason" placeholder="Explain the refund request (at least 10 characters)" value={reason} onChangeText={setReason} multiline maxLength={2000} style={styles.input} />
              <Pressable accessibilityRole="button" disabled={busy || reason.trim().length < 10} onPress={() => void act('/refund-request', { reason: reason.trim() })} style={styles.button}>
                <Text style={styles.buttonText}>Request refund review</Text>
              </Pressable>
            </>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8, paddingVertical: 12 },
  input: { borderWidth: 1, borderColor: '#b7cbbf', borderRadius: 8, padding: 10, color: '#173f32' },
  button: { backgroundColor: '#185A43', borderRadius: 8, padding: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
  error: { color: '#b91c1c' },
});
