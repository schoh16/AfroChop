import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { VerificationProgress } from './AuthUi';

const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';
const colors = {
  forest: '#185A43',
  spice: '#E69B45',
  cream: '#F8EEDD',
  terracotta: '#B84F30',
  brown: '#3A2E22',
  muted: '#756C61',
};

type VerificationStatus = {
  type: string;
  status: string;
  verifiedAt: string | null;
  expiresAt: string | null;
};

type VerificationSummary = {
  phoneNumberLast4?: string | null;
  verifications: VerificationStatus[];
  chef?: {
    approvalStatus: string;
    credentials: Array<{
      id: string;
      name: string;
      status: string;
      expiresAt: string | null;
    }>;
    permits: Array<{
      id: string;
      permitType: string;
      serviceType: string;
      jurisdictionCode: string;
      verificationStatus: string;
      expiresAt: string | null;
    }>;
    serviceApprovals: Array<{
      serviceType: string;
      jurisdictionCode: string;
      status: string;
    }>;
    stripePayments: { status: string } | null;
    nextSteps: string[];
  };
};

export function ChefVerificationChecklist({
  accessToken,
}: {
  accessToken: string;
}) {
  const [summary, setSummary] = useState<VerificationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadVerification = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/verification/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error(`Verification status failed (${response.status}).`);
      setSummary(await response.json());
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Could not load verification status.',
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadVerification();
  }, [loadVerification]);

  if (loading) {
    return <ActivityIndicator accessibilityLabel="Loading verification status" color={colors.forest} />;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Verification checklist</Text>
      {error ? (
        <View>
          <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => void loadVerification()}>
            <Text style={styles.retry}>Try again</Text>
          </Pressable>
        </View>
      ) : summary?.chef ? (
        <>
          <Text style={styles.status}>Account: {summary.chef.approvalStatus}</Text>
          <VerificationProgress steps={[
            {
              label: 'Email verification',
              status: summary.verifications.find((item) => item.type === 'email')?.status === 'verified'
                ? 'complete'
                : 'current',
            },
            {
              label: 'Phone verification',
              status: summary.verifications.find((item) => item.type === 'phone')?.status === 'verified'
                ? 'complete'
                : 'pending',
            },
            {
              label: 'Identity and credential review',
              status: summary.chef.approvalStatus === 'approved' ? 'complete' : 'current',
            },
            {
              label: 'Payout account',
              status: summary.chef.stripePayments?.status === 'eligible' ? 'complete' : 'pending',
            },
          ]} />
          {summary.verifications.map((item) => (
            <Text key={item.type} style={styles.row}>
              {item.type}: {item.status}
              {item.expiresAt ? ` · expires ${new Date(item.expiresAt).toLocaleDateString()}` : ''}
            </Text>
          ))}
          <Text style={styles.sectionTitle}>Payout setup</Text>
          <Text style={styles.row}>Stripe Connect: {summary.chef.stripePayments?.status ?? 'not started'}</Text>
          <Text style={styles.sectionTitle}>Approved services</Text>
          {summary.chef.serviceApprovals.length ? summary.chef.serviceApprovals.map((approval) => (
            <Text key={`${approval.serviceType}-${approval.jurisdictionCode}`} style={styles.row}>
              {approval.serviceType} · {approval.jurisdictionCode}: {approval.status}
            </Text>
          )) : <Text style={styles.row}>No service approvals yet.</Text>}
          {summary.chef.nextSteps.length ? (
            <>
              <Text style={styles.sectionTitle}>Next steps</Text>
              {summary.chef.nextSteps.map((step) => <Text key={step} style={styles.row}>• {step}</Text>)}
            </>
          ) : <Text style={styles.complete}>Your verification checklist is complete.</Text>}
        </>
      ) : (
        <>
          <Text style={styles.row}>Email: {summary?.verifications.find((item) => item.type === 'email')?.status ?? 'pending'}</Text>
          <Text style={styles.row}>
            Phone{summary?.phoneNumberLast4 ? ` ending in ${summary.phoneNumberLast4}` : ''}: {summary?.verifications.find((item) => item.type === 'phone')?.status ?? 'pending'}
          </Text>
          <Text style={styles.note}>Email and phone must be verified before booking.</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cream,
    borderColor: '#E6DAC5',
    borderRadius: 18,
    borderWidth: 1,
    gap: 9,
    padding: 18,
  },
  title: { color: colors.forest, fontSize: 19, fontWeight: '800' },
  sectionTitle: { color: colors.brown, fontSize: 14, fontWeight: '800', marginTop: 5 },
  status: { color: colors.forest, fontSize: 14, fontWeight: '700' },
  row: { color: colors.brown, fontSize: 13 },
  note: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  complete: { color: colors.forest, fontSize: 13, fontWeight: '700' },
  error: { color: colors.terracotta, fontSize: 13 },
  retry: { color: colors.forest, fontSize: 13, fontWeight: '700', marginTop: 8 },
});
