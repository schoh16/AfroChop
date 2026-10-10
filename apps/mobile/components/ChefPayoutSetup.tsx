import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';
const colors = {
  forest: '#185A43',
  spice: '#E69B45',
  cream: '#F8EEDD',
  terracotta: '#B84F30',
  brown: '#3A2E22',
  muted: '#756C61',
};

type PayoutStatus = {
  connected: boolean;
  status: 'pending' | 'restricted' | 'eligible';
  eligibleToReceiveTransfers: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirements: {
    currentlyDue?: string[];
    eventuallyDue?: string[];
    pastDue?: string[];
  } | null;
  disabledReason: string | null;
  chefCommissionPercent: number;
  lastSyncedAt: string | null;
};

export function ChefPayoutSetup({ accessToken }: { accessToken: string }) {
  const [status, setStatus] = useState<PayoutStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadStatus() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/payments/chef/connect/status`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        throw new Error(`Payout status failed (${response.status}).`);
      }
      setStatus(await response.json());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load payout status.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, [accessToken]);

  async function startOnboarding() {
    setIsLoading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBaseUrl}/payments/chef/connect/onboarding`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        throw new Error(`Payout onboarding could not start (${response.status}).`);
      }
      const result: { url: string } = await response.json();
      const onboardingUrl = new URL(result.url);
      if (
        onboardingUrl.protocol !== 'https:' ||
        !['accounts.stripe.com', 'connect.stripe.com'].includes(onboardingUrl.hostname)
      ) {
        throw new Error('Stripe returned an untrusted onboarding URL.');
      }
      await Linking.openURL(onboardingUrl.toString());
      setNotice('Complete identity and payout setup in your browser, then return here to refresh your status.');
    } catch (onboardingError) {
      setError(
        onboardingError instanceof Error
          ? onboardingError.message
          : 'Could not open Stripe onboarding.',
      );
    } finally {
      setIsLoading(false);
    }
  }

  const outstandingRequirements = [
    ...(status?.requirements?.currentlyDue ?? []),
    ...(status?.requirements?.pastDue ?? []),
  ];

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Payout setup</Text>
      {isLoading && !status ? (
        <ActivityIndicator color={colors.forest} />
      ) : status ? (
        <>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                status.eligibleToReceiveTransfers ? styles.statusReady : styles.statusPending,
              ]}
            />
            <Text style={styles.statusText}>
              {status.eligibleToReceiveTransfers
                ? 'Eligible to receive transfers'
                : status.status === 'restricted'
                  ? 'Action required'
                  : status.connected
                    ? 'Setup in progress'
                    : 'Not connected'}
            </Text>
          </View>
          <Text style={styles.body}>
            Chef commission: {status.chefCommissionPercent}%. Stripe verifies your identity and payout account.
          </Text>
          {status.disabledReason ? (
            <Text style={styles.warning}>Stripe status: {status.disabledReason}</Text>
          ) : null}
          {outstandingRequirements.length ? (
            <View style={styles.requirements}>
              <Text style={styles.requirementsTitle}>Information needed</Text>
              {outstandingRequirements.map((requirement) => (
                <Text key={requirement} style={styles.requirement}>
                  • {requirement.replaceAll('_', ' ')}
                </Text>
              ))}
            </View>
          ) : null}
          {status.lastSyncedAt ? (
            <Text style={styles.synced}>
              Stripe status updated {new Date(status.lastSyncedAt).toLocaleString()}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={isLoading || status.eligibleToReceiveTransfers}
              onPress={() => void startOnboarding()}
              style={[
                styles.primaryButton,
                (isLoading || status.eligibleToReceiveTransfers) && styles.disabled,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {status.connected ? 'Continue Stripe setup' : 'Set up Stripe payouts'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={isLoading}
              onPress={() => void loadStatus()}
              style={styles.refreshButton}
            >
              <Text style={styles.refreshText}>Refresh status</Text>
            </Pressable>
          </View>
        </>
      ) : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: colors.forest,
  },
  title: {
    color: colors.brown,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 8,
  },
  statusReady: {
    backgroundColor: colors.forest,
  },
  statusPending: {
    backgroundColor: colors.spice,
  },
  statusText: {
    color: colors.forest,
    fontSize: 14,
    fontWeight: '800',
  },
  body: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  warning: {
    color: colors.terracotta,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
  },
  requirements: {
    backgroundColor: colors.cream,
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
  },
  requirementsTitle: {
    color: colors.brown,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 5,
  },
  requirement: {
    color: colors.brown,
    fontSize: 12,
    lineHeight: 18,
  },
  synced: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 8,
  },
  actions: {
    marginTop: 12,
  },
  primaryButton: {
    backgroundColor: colors.forest,
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  disabled: {
    opacity: 0.45,
  },
  refreshButton: {
    alignSelf: 'center',
    padding: 10,
  },
  refreshText: {
    color: colors.terracotta,
    fontSize: 12,
    fontWeight: '700',
  },
  error: {
    color: colors.terracotta,
    fontSize: 12,
    marginTop: 8,
  },
  notice: {
    color: colors.forest,
    fontSize: 12,
    marginTop: 8,
  },
});
