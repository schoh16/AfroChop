import { authenticatedFetch as fetch } from '../lib/session';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

type ServiceAddress = {
  id: string; jurisdictionCode: string; status: string; expiresAt: string | null; displayLabel: string;
};
type Verification = {
  email: string; phoneNumberLast4: string | null;
  verifications: { type: string; status: string; expiresAt: string | null }[];
  serviceAddresses: ServiceAddress[];
};

export function AccountVerification({
  token, apiBaseUrl, jurisdiction, selectedAddressId, onSelectAddress, customer = true,
}: {
  token: string; apiBaseUrl: string; jurisdiction?: string; selectedAddressId?: string;
  onSelectAddress?: (id: string) => void;
  customer?: boolean;
}) {
  const [verification, setVerification] = useState<Verification | null>(null);
  const [expanded, setExpanded] = useState(Boolean(onSelectAddress));
  const [phone, setPhone] = useState('');
  const [codes, setCodes] = useState({ email: '', phone: '' });
  const [address, setAddress] = useState({ line1: '', line2: '', city: '', region: '', postalCode: '', countryCode: '', jurisdictionCode: '' });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const call = useCallback(async <T,>(path: string, method = 'GET', body?: object): Promise<T> => {
    const response = await fetch(`${apiBaseUrl}/verification/me${path}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(Array.isArray(result.message) ? result.message.join(' ') : result.message ?? 'Verification request failed.');
    return result;
  }, [apiBaseUrl, token]);
  const load = useCallback(async () => {
    try {
      setVerification(await call<Verification>(''));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load verification.');
    }
  }, [call]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function act(path: string, method: string, body: object, success: string) {
    setBusy(true); setError(null); setNotice(null);
    try {
      await call(path, method, body);
      setNotice(success);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Verification action failed.');
    } finally { setBusy(false); }
  }
  const status = (type: string) => {
    const record = verification?.verifications.find((item) => item.type === type);
    return record?.expiresAt && new Date(record.expiresAt) <= new Date() ? 'expired' : record?.status ?? 'pending';
  };
  return (
    <View style={styles.box}>
      <Pressable accessibilityRole="button" onPress={() => setExpanded(!expanded)}>
        <Text style={styles.title}>{customer ? 'Account verification and service addresses' : 'Email and phone verification'} {expanded ? '-' : '+'}</Text>
      </Pressable>
      <Text>Email: {status('email')} | Phone: {status('phone')}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text>{notice}</Text> : null}
      {expanded ? (
        <>
          <Text>Verify both contacts before booking. Identity, provider credentials, and jurisdiction approvals are reviewed separately by AfroChop.</Text>
          <TextInput accessibilityLabel="Phone number" placeholder="Phone in international format, e.g. +1..." value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={styles.input} />
          <Pressable accessibilityRole="button" disabled={busy || !/^\+[1-9]\d{7,14}$/.test(phone)} style={styles.button}
            onPress={() => void act('/phone', 'PUT', { phoneNumber: phone }, 'Phone saved. Verify the new number.')}>
            <Text style={styles.buttonText}>Save phone number</Text>
          </Pressable>
          {(['email', 'phone'] as const).map((type) => (
            <View key={type} style={styles.group}>
              <Text>{type === 'email' ? verification?.email : `Phone ending ${verification?.phoneNumberLast4 ?? 'not set'}`}</Text>
              <Pressable accessibilityRole="button" disabled={busy || status(type) === 'verified'} style={styles.button}
                onPress={() => void act(`/${type}/send-code`, 'POST', {}, 'Code sent. Wait 60 seconds before requesting another.')}>
                <Text style={styles.buttonText}>Send {type} code</Text>
              </Pressable>
              <TextInput accessibilityLabel={`${type} verification code`} placeholder="Verification code" value={codes[type]} onChangeText={(value) => setCodes((previous) => ({ ...previous, [type]: value }))} keyboardType="number-pad" maxLength={10} style={styles.input} />
              <Pressable accessibilityRole="button" disabled={busy || !/^\d{4,10}$/.test(codes[type])} style={styles.button}
                onPress={() => void act(`/${type}/check-code`, 'POST', { code: codes[type] }, `${type} verified.`)}>
                <Text style={styles.buttonText}>Verify {type}</Text>
              </Pressable>
            </View>
          ))}
          {customer ? (
          <>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void load()}>
            <Text style={styles.title}>Refresh verification and addresses</Text>
          </Pressable>
          {verification?.serviceAddresses.map((item) => {
            const usable = item.status === 'verified' && (!item.expiresAt || new Date(item.expiresAt) > new Date()) &&
              (!jurisdiction || item.jurisdictionCode === jurisdiction);
            return (
              <Pressable key={item.id} accessibilityRole={onSelectAddress ? 'radio' : 'text'}
                accessibilityState={{ selected: selectedAddressId === item.id, disabled: !usable }}
                disabled={!usable || !onSelectAddress} onPress={() => onSelectAddress?.(item.id)} style={styles.input}>
                <Text>{item.displayLabel} | {item.jurisdictionCode} | {item.status}{selectedAddressId === item.id ? ' | Selected' : ''}</Text>
              </Pressable>
            );
          })}
          <Text>Submit an in-home service address for administrator verification. Submission alone does not approve it.</Text>
          {(['line1', 'line2', 'city', 'region', 'postalCode', 'countryCode', 'jurisdictionCode'] as const).map((field) => (
            <TextInput key={field} accessibilityLabel={`Service address ${field}`} placeholder={field === 'countryCode' ? 'Country code (e.g. US)' : field === 'jurisdictionCode' ? 'Jurisdiction (e.g. US-MD)' : field}
              value={address[field]} onChangeText={(value) => setAddress((previous) => ({ ...previous, [field]: value }))}
              autoCapitalize={field.includes('Code') ? 'characters' : 'words'} maxLength={160} style={styles.input} />
          ))}
          <Pressable accessibilityRole="button" disabled={busy} style={styles.button}
            onPress={() => void act('/service-addresses', 'POST', address, 'Address submitted for review. Refresh after approval.')}>
            <Text style={styles.buttonText}>Submit service address for verification</Text>
          </Pressable>
          </>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { padding: 12, gap: 10, backgroundColor: '#fffaf0', borderRadius: 10 },
  group: { gap: 8 },
  title: { color: '#185A43', fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#b7cbbf', borderRadius: 8, padding: 10, color: '#173f32' },
  button: { backgroundColor: '#185A43', borderRadius: 8, padding: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
  error: { color: '#b91c1c' },
});
