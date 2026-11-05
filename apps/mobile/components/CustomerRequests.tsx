import { authenticatedFetch as fetch } from '../lib/session';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { MessagePartner } from './Messaging';
import { ReviewForm } from './Reviews';
import { BookingPaymentStatus } from './BookingPaymentStatus';
import { AccountVerification } from './AccountVerification';

type Quote = {
  id: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  amount: string | number;
  downPaymentPercent: number;
  notes: string | null;
  chef: { id: string; userId: string; displayName: string };
};

type CustomerRequest = {
  id: string;
  status: string;
  serviceType: string;
  requestedDate: string | null;
  durationMinutes: number | null;
  paymentHoldExpiresAt: string | null;
  chefCompletedAt: string | null;
  customerCompletedAt: string | null;
  allergyReviewStatus: string;
  allergyResponseNote: string | null;
  notes: string | null;
  quotes: Quote[];
};

type EligibleReview = { id: string };

type Props = {
  token: string;
  apiBaseUrl: string;
  onBack: () => void;
  onMessage: (partner: MessagePartner) => void;
};

const statusLabels: Record<string, string> = {
  requested: 'Waiting for the cook’s quote',
  quoted: 'Quote received',
  awaiting_payment: 'Quote accepted · payment is the next step',
  expired: 'Payment window expired · request a new quote',
  confirmed: 'Confirmed · payment received',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
};

export function CustomerRequests({ token, apiBaseUrl, onBack, onMessage }: Props) {
  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eligibleReviewIds, setEligibleReviewIds] = useState<string[]>([]);
  const [customerFeeBps, setCustomerFeeBps] = useState<number | null>(null);
  const loadingRef = useRef(false);

  const call = useCallback(
    async <T,>(path: string, method = 'GET'): Promise<T> => {
      const response = await fetch(`${apiBaseUrl}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const body = (await response.json().catch(() => null)) as
        | (T & { message?: string | string[] })
        | null;
      if (!response.ok) {
        const message = Array.isArray(body?.message) ? body?.message[0] : body?.message;
        throw new Error(message ?? 'Request failed.');
      }
      return body as T;
    },
    [apiBaseUrl, token],
  );

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const [initialList, configuration] = await Promise.all([
        call<CustomerRequest[]>('/quotes/requests'),
        call<{ customerMarketplaceFeeBps: number }>('/payments/configuration'),
      ]);
      let list = initialList;
      setCustomerFeeBps(configuration.customerMarketplaceFeeBps);
      let loadError: string | null = null;
      try {
        const eligible = await call<EligibleReview[]>('/reviews/eligible-bookings');
        setEligibleReviewIds(eligible.map(({ id }) => id));
      } catch (reviewError) {
        loadError = reviewError instanceof Error
          ? `Requests loaded, but review eligibility could not be refreshed: ${reviewError.message}`
          : 'Requests loaded, but review eligibility could not be refreshed.';
      }

      const acceptedQuotes = list
        .filter((item) => item.status === 'awaiting_payment')
        .flatMap((item) => item.quotes
          .filter((quote) => quote.status === 'accepted')
          .map((quote) => quote.id));
      const paymentChecks = await Promise.all(
        acceptedQuotes.map(async (quoteId) => {
          try {
            return await call<{ paid: boolean; status?: string }>(
              `/payments/quotes/${quoteId}/confirm`,
              'POST',
            );
          } catch (paymentError) {
            return {
              paid: false,
              status: undefined,
              error: paymentError instanceof Error
                ? paymentError.message
                : 'Could not verify a booking payment.',
            };
          }
        }),
      );
      if (paymentChecks.some(({ paid, status }) => paid || status === 'expired')) {
        list = await call<CustomerRequest[]>('/quotes/requests');
      }
      if (loadError === null) {
        const paymentError = paymentChecks.find((result) => 'error' in result);
        if (paymentError && 'error' in paymentError) {
          loadError = `Could not verify payment status: ${paymentError.error}`;
        }
      }
      setRequests(list);
      setError(loadError);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load your requests.');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [call]);

  useEffect(() => {
    const initialLoad = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), 10000);
    return () => {
      clearTimeout(initialLoad);
      clearInterval(timer);
    };
  }, [load]);

  async function payDeposit(quoteId: string) {
    setBusyId(quoteId);
    try {
      const { url } = await call<{ url: string }>(`/payments/quotes/${quoteId}/checkout`, 'POST');
      await Linking.openURL(url);
    } catch (payError) {
      setError(payError instanceof Error ? payError.message : 'Could not start payment.');
    } finally {
      setBusyId(null);
    }
  }

  async function respond(quoteId: string, action: 'accept' | 'decline') {
    setBusyId(quoteId);
    try {
      await call(`/quotes/${quoteId}/${action}`, 'POST');
      await load();
    } catch (respondError) {
      setError(respondError instanceof Error ? respondError.message : 'Could not update the quote.');
    } finally {
      setBusyId(null);
    }
  }

  async function confirmCompletion(bookingId: string) {
    setBusyId(bookingId);
    try {
      const result = await call<{ payoutMessage?: string }>(`/quotes/requests/${bookingId}/complete`, 'PATCH');
      await load();
      if (result.payoutMessage) setError(`Receipt confirmed. Cook payout remains held: ${result.payoutMessage}`);
    } catch (completionError) {
      setError(completionError instanceof Error
        ? completionError.message
        : 'Could not confirm completion.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>My requests</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh requests"
          disabled={loading}
          onPress={() => void load()}
          style={styles.refresh}
        >
          <Text style={styles.back}>{loading ? '…' : 'Refresh'}</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? (
        <ActivityIndicator style={styles.loader} color="#c2410c" />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <AccountVerification token={token} apiBaseUrl={apiBaseUrl} />
          {requests.length === 0 ? (
            <Text style={styles.empty}>
              You haven’t requested a quote yet. Open a cook’s profile and tap “Discuss an order &amp; get a quote”.
            </Text>
          ) : (
            requests.map((request) => {
              return (
                <View key={request.id} style={styles.card}>
                  <Text style={styles.cardTitle}>{request.serviceType.replaceAll('_', ' ')}</Text>
                  {request.requestedDate ? (
                    <Text style={styles.detail}>
                      {new Date(request.requestedDate).toLocaleString()}
                      {request.durationMinutes ? ` · ${request.durationMinutes} min` : ''}
                    </Text>
                  ) : null}
                  <Text style={styles.status}>{statusLabels[request.status] ?? request.status}</Text>
                  {request.allergyReviewStatus === 'pending' ? (
                    <Text style={styles.detail}>The cook is reviewing your allergy information before quoting.</Text>
                  ) : null}
                  {request.allergyReviewStatus === 'declined' ? (
                    <Text style={styles.error}>The cook cannot accommodate the disclosed allergy details.</Text>
                  ) : null}
                  {request.allergyResponseNote ? (
                    <Text style={styles.detail}>Cook’s allergy response: {request.allergyResponseNote}</Text>
                  ) : null}
                  {request.notes ? <Text style={styles.detail}>Your request: {request.notes}</Text> : null}
                  {request.quotes.map((quote) => {
                    const amount = Number(quote.amount);
                    return (
                      <View key={quote.id} style={styles.quote}>
                        <Text style={styles.detail}>Quote from {quote.chef.displayName}</Text>
                        <Text style={styles.amount}>${amount.toFixed(2)}</Text>
                        {customerFeeBps !== null ? (
                          <Text style={styles.detail}>
                            Marketplace fee: ${(Math.round(amount * customerFeeBps / 100) / 100).toFixed(2)}.
                            {' '}Total: ${(amount + Math.round(amount * customerFeeBps / 100) / 100).toFixed(2)} USD.
                            Checkout shows the final snapshotted total before you pay.
                          </Text>
                        ) : null}
                        {quote.notes ? <Text style={styles.detail}>{quote.notes}</Text> : null}
                        {quote.status === 'pending' && request.status === 'quoted' ? (
                          <View style={styles.actions}>
                            <Pressable
                              accessibilityRole="button"
                              disabled={busyId === quote.id}
                              onPress={() => void respond(quote.id, 'accept')}
                              style={[styles.accept, busyId === quote.id && styles.disabled]}
                            >
                              <Text style={styles.acceptText}>Accept quote</Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              disabled={busyId === quote.id}
                              onPress={() => void respond(quote.id, 'decline')}
                              style={[styles.decline, busyId === quote.id && styles.disabled]}
                            >
                              <Text style={styles.declineText}>Decline</Text>
                            </Pressable>
                          </View>
                        ) : null}
                        {quote.status === 'accepted' && request.status === 'awaiting_payment' ? (
                          <>
                            <Text style={styles.detail}>
                              The slot is held until {request.paymentHoldExpiresAt
                                ? new Date(request.paymentHoldExpiresAt).toLocaleString()
                                : 'the payment window expires'}.
                            </Text>
                            <Pressable
                              accessibilityRole="button"
                              disabled={
                                busyId === quote.id ||
                                !request.paymentHoldExpiresAt ||
                                new Date(request.paymentHoldExpiresAt).getTime() <= Date.now()
                              }
                              onPress={() => void payDeposit(quote.id)}
                              style={[
                                styles.accept,
                                (!request.paymentHoldExpiresAt ||
                                  new Date(request.paymentHoldExpiresAt).getTime() <= Date.now()) &&
                                  styles.disabled,
                              ]}
                            >
                              <Text style={styles.acceptText}>Review total and pay in Stripe</Text>
                            </Pressable>
                          </>
                        ) : null}
                        {quote.status === 'expired' ? (
                          <Text style={styles.detail}>This quote’s payment window expired.</Text>
                        ) : null}
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => onMessage({ id: quote.chef.userId, name: quote.chef.displayName })}
                          style={styles.message}
                        >
                          <Text style={styles.messageText}>Message {quote.chef.displayName}</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                  {request.status === 'confirmed' || request.status === 'in_progress' ? (
                    request.chefCompletedAt && !request.customerCompletedAt ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={busyId === request.id}
                      onPress={() => void confirmCompletion(request.id)}
                      style={[styles.accept, busyId === request.id && styles.disabled]}
                    >
                      <Text style={styles.acceptText}>Confirm delivery received / service complete</Text>
                    </Pressable>
                    ) : <Text style={styles.detail}>Waiting for the cook to mark delivery or service complete. Cook funds remain held until you confirm receipt.</Text>
                  ) : null}
                  {['confirmed', 'in_progress', 'completed', 'disputed', 'cancelled'].includes(request.status) ? (
                    <BookingPaymentStatus bookingId={request.id} token={token} apiBaseUrl={apiBaseUrl} customer completed={request.status === 'completed'} />
                  ) : null}
                  {eligibleReviewIds.includes(request.id) ? (
                    <ReviewForm
                      bookingId={request.id}
                      accessToken={token}
                      onSubmitted={() => void load()}
                    />
                  ) : null}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff7ed' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    paddingTop: 48,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#fed7aa',
  },
  refresh: { paddingVertical: 6, paddingHorizontal: 2 },
  back: { color: '#c2410c', fontWeight: '700', fontSize: 16 },
  title: { flex: 1, fontSize: 18, fontWeight: '800', color: '#431407' },
  error: { color: '#b91c1c', padding: 12 },
  loader: { marginTop: 32 },
  list: { padding: 16, gap: 12 },
  empty: { color: '#7c2d12', textAlign: 'center', padding: 24, lineHeight: 20 },
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#fed7aa', padding: 14, gap: 6 },
  cardTitle: { fontWeight: '800', color: '#431407', fontSize: 16, textTransform: 'capitalize' },
  detail: { color: '#57534e' },
  status: { color: '#c2410c', fontWeight: '700' },
  quote: { backgroundColor: '#fffbf5', borderRadius: 10, padding: 10, gap: 4 },
  amount: { fontSize: 24, fontWeight: '800', color: '#431407' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  accept: { flex: 1, backgroundColor: '#c2410c', borderRadius: 10, padding: 12, alignItems: 'center' },
  acceptText: { color: '#fff', fontWeight: '800' },
  decline: { flex: 1, borderWidth: 1, borderColor: '#c2410c', borderRadius: 10, padding: 12, alignItems: 'center' },
  declineText: { color: '#c2410c', fontWeight: '800' },
  disabled: { opacity: 0.55 },
  message: { borderWidth: 1, borderColor: '#fed7aa', borderRadius: 10, padding: 10, alignItems: 'center' },
  messageText: { color: '#c2410c', fontWeight: '700' },
});
