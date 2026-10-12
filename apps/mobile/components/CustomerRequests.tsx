import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { MessagePartner } from './Messaging';

type Quote = {
  id: string;
  status: 'pending' | 'accepted' | 'declined';
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
  notes: string | null;
  quotes: Quote[];
};

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
  confirmed: 'Confirmed · deposit paid',
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
    try {
      const list = await call<CustomerRequest[]>('/quotes/requests');
      const unpaid = list.filter((item) => item.status === 'awaiting_payment');
      if (unpaid.length > 0) {
        const results = await Promise.all(
          unpaid.map((item) =>
            call<{ paid: boolean }>(`/payments/quotes/${item.quotes[0]?.id}/confirm`, 'POST').catch(
              () => ({ paid: false }),
            ),
          ),
        );
        if (results.some((result) => result.paid)) {
          setRequests(await call<CustomerRequest[]>('/quotes/requests'));
          setError(null);
          return;
        }
      }
      setRequests(list);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load your requests.');
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 10000);
    return () => clearInterval(timer);
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>My requests</Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? (
        <ActivityIndicator style={styles.loader} color="#c2410c" />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {requests.length === 0 ? (
            <Text style={styles.empty}>
              You haven’t requested a quote yet. Open a cook’s profile and tap “Discuss an order &amp; get a quote”.
            </Text>
          ) : (
            requests.map((request) => {
              const quote = request.quotes[0];
              const amount = quote ? Number(quote.amount) : 0;
              return (
                <View key={request.id} style={styles.card}>
                  <Text style={styles.cardTitle}>{request.serviceType.replaceAll('_', ' ')}</Text>
                  {request.requestedDate ? (
                    <Text style={styles.detail}>{new Date(request.requestedDate).toLocaleDateString()}</Text>
                  ) : null}
                  <Text style={styles.status}>{statusLabels[request.status] ?? request.status}</Text>
                  {quote ? (
                    <View style={styles.quote}>
                      <Text style={styles.detail}>From {quote.chef.displayName}</Text>
                      <Text style={styles.amount}>${amount.toFixed(2)}</Text>
                      <Text style={styles.detail}>
                        {quote.downPaymentPercent}% deposit (${((amount * quote.downPaymentPercent) / 100).toFixed(2)}) due to confirm
                      </Text>
                      {quote.notes ? <Text style={styles.detail}>{quote.notes}</Text> : null}
                      {quote.status === 'pending' && request.status === 'quoted' ? (
                        <View style={styles.actions}>
                          <Pressable
                            accessibilityRole="button"
                            disabled={busyId === quote.id}
                            onPress={() => void respond(quote.id, 'accept')}
                            style={styles.accept}
                          >
                            <Text style={styles.acceptText}>Accept quote</Text>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            disabled={busyId === quote.id}
                            onPress={() => void respond(quote.id, 'decline')}
                            style={styles.decline}
                          >
                            <Text style={styles.declineText}>Decline</Text>
                          </Pressable>
                        </View>
                      ) : null}
                      {quote.status === 'accepted' && request.status === 'awaiting_payment' ? (
                        <Pressable
                          accessibilityRole="button"
                          disabled={busyId === quote.id}
                          onPress={() => void payDeposit(quote.id)}
                          style={styles.accept}
                        >
                          <Text style={styles.acceptText}>
                            Pay ${((amount * quote.downPaymentPercent) / 100).toFixed(2)} deposit
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                  {quote ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => onMessage({ id: quote.chef.userId, name: quote.chef.displayName })}
                      style={styles.message}
                    >
                      <Text style={styles.messageText}>💬 Message {quote.chef.displayName}</Text>
                    </Pressable>
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
  message: { borderWidth: 1, borderColor: '#fed7aa', borderRadius: 10, padding: 10, alignItems: 'center' },
  messageText: { color: '#c2410c', fontWeight: '700' },
});
