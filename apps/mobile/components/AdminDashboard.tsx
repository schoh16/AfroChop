import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PrimaryButton } from './AuthUi';
import { StaffReviews } from './StaffReviews';
import { GroceryAdmin } from './GroceryAdmin';
import { CalendarPicker, toDateKey } from './CalendarPicker';
import { marketplaceApi } from '../lib/marketplaceApi';
import { getCurrentSession } from '../lib/session';
import {
  applicationStatusLabels, approvedApplicationCount, nextApplicationStatus, publicationBlocker, visitTimeToIso,
  type AdminApplication, type ApplicationReview, type ApplicationStatus, type VisitAddress,
} from '../lib/adminApplications';

const queuePath = '/admin/verification/chef-applications';
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Could not complete the request. Please try again.';
const dateLabel = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not recorded';

export function AdminDashboard({ apiBaseUrl, token, name, onSignOut }: {
  apiBaseUrl: string; token: string; name: string; onSignOut: () => Promise<void>;
}) {
  const api = useMemo(() => marketplaceApi(apiBaseUrl, token), [apiBaseUrl, token]);
  const [applications, setApplications] = useState<AdminApplication[]>([]);
  const [selected, setSelected] = useState<AdminApplication | null>(null);
  const [filter, setFilter] = useState<ApplicationStatus | 'all'>('submitted');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [showReviews, setShowReviews] = useState(false);
  const [showGrocery, setShowGrocery] = useState(false);

  const fetchQueue = useCallback(async () => {
    const session = await getCurrentSession();
    if (session.role !== 'admin') throw new Error('Administrator access is required. Sign out and sign in with an administrator account.');
    return api<AdminApplication[]>(queuePath, { cache: 'no-store' });
  }, [api]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setApplications(await fetchQueue());
    } catch (e) {
      setApplications([]);
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [fetchQueue]);

  useEffect(() => {
    let active = true;
    void fetchQueue().then((items) => {
      if (active) setApplications(items);
    }).catch((e: unknown) => {
      if (active) setError(errorMessage(e));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [fetchQueue]);

  const filtered = applications.filter((application) =>
    (filter === 'all' || application.status === filter) &&
    `${application.chef.displayName} ${application.chef.user.email} ${application.id}`.toLowerCase().includes(search.trim().toLowerCase()));

  async function signOut() {
    setSigningOut(true);
    setError(null);
    try { await onSignOut(); }
    catch (e) { setError(errorMessage(e)); }
    finally { setSigningOut(false); }
  }

  const header = <>
    <View style={s.header}>
      <View style={s.headerText}>
        <Text style={s.eyebrow}>AFROCHOP ADMINISTRATION</Text>
        <Text style={s.title}>{showGrocery ? 'Grocery store' : showReviews ? 'Staff reviews' : 'Cook applications'}</Text>
        <Text style={s.body}>Welcome, {name}. Private staff workspace.</Text>
      </View>
      <PrimaryButton label="Sign Out" secondary loading={signingOut} onPress={() => void signOut()} />
    </View>
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {notice ? <Text accessibilityRole="alert" style={s.notice}>{notice}</Text> : null}
    <View style={s.sectionButtons}>
      <PrimaryButton label={showReviews ? 'Back to cook applications' : 'Verification and refund reviews'} secondary
        onPress={() => { setSelected(null); setShowGrocery(false); setShowReviews((value) => !value); }} />
      <PrimaryButton label={showGrocery ? 'Back to cook applications' : '🛒 Grocery store'} secondary
        onPress={() => { setSelected(null); setShowReviews(false); setShowGrocery((value) => !value); }} />
    </View>
  </>;
  return <View style={s.page}>
    {showGrocery ? <>{header}<ScrollView contentContainerStyle={s.list} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <GroceryAdmin api={api} apiBaseUrl={apiBaseUrl} token={token} /></ScrollView></> :
    showReviews ? <>{header}<StaffReviews api={api} applications={applications} /></> :
    selected ? <>{header}<ApplicationDetail key={selected.id} application={selected} api={api}
      onBack={() => { setSelected(null); }}
      onSaved={(updated) => {
        setSelected(null);
        setApplications((items) => items.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
        setNotice(`Application saved: ${applicationStatusLabels[updated.status]}.`);
        void load();
      }} /></> : <FlatList data={loading ? [] : filtered} keyExtractor={(item) => item.id} contentContainerStyle={s.list}
      refreshing={loading} onRefresh={() => void load()}
      ListHeaderComponent={<>{header}
      <View style={s.controls}>
        <Text style={s.body}>Review applications here even when email and SMS alerts are not configured.</Text>
        <Pressable accessibilityRole="button" disabled={loading || Boolean(error)}
          accessibilityLabel={loading ? 'Loading approved cook count' : error ? 'Approved cook count unavailable' :
            `${approvedApplicationCount(applications)} approved cooks. View completed applications.`}
          onPress={() => { setSearch(''); setFilter('profile_setup'); }} style={s.summary}>
          <Text style={s.heading}>Approved / setup complete</Text>
          <Text style={s.summaryCount}>{loading ? 'Loading...' : error ? 'Unavailable' : approvedApplicationCount(applications)}</Text>
          <Text style={s.body}>Cooks approved and published after their visit, interview, and profile setup.</Text>
          {!loading && !error ? <Text style={s.link}>View approved cooks</Text> : null}
        </Pressable>
        <TextInput accessibilityLabel="Search cook applications" placeholder="Search name, email, or application reference"
          value={search} onChangeText={setSearch} style={s.input} />
        <View style={s.filters}>
          {(['submitted', 'visit_scheduled', 'interviewed', 'profile_setup', 'rejected', 'all'] as const).map((status) =>
            <Pressable key={status} accessibilityRole="button" accessibilityState={{ selected: filter === status }}
              onPress={() => setFilter(status)} style={[s.chip, filter === status && s.chipSelected]}>
              <Text style={filter === status ? s.chipSelectedText : s.body}>
                {status === 'all' ? 'All' : applicationStatusLabels[status]} ({applications.filter((item) => status === 'all' || item.status === status).length})
              </Text>
            </Pressable>)}
        </View>
        <PrimaryButton label="Refresh applications" secondary disabled={loading} onPress={() => { setNotice(null); void load(); }} />
      </View></>}
          ListEmptyComponent={loading ? <View style={s.loading}><ActivityIndicator color="#185A43" /><Text style={s.body}>Loading applications...</Text></View> :
            <Text style={s.body}>{error ? 'The application queue could not be loaded. Use Refresh to retry.' : 'No applications match this view.'}</Text>}
          renderItem={({ item }) => <Pressable accessibilityRole="button"
            accessibilityLabel={`Review ${item.chef.displayName}, ${applicationStatusLabels[item.status]}`}
            onPress={() => { setNotice(null); setSelected(item); }} style={s.card}>
            <Text style={s.heading}>{item.chef.displayName}</Text>
            <Text style={s.body}>{item.chef.user.email}</Text>
            <Text style={s.status}>{applicationStatusLabels[item.status]}</Text>
            <Text style={s.body}>Submitted: {dateLabel(item.submittedAt)}</Text>
            {item.visitScheduledAt ? <Text style={s.body}>Visit: {dateLabel(item.visitScheduledAt)}</Text> : null}
            {item.status === 'profile_setup' ? <Text style={s.body}>Approved / setup complete: {dateLabel(item.profileSetupAt)}</Text> : null}
            <Text style={s.reference}>Reference: {item.id}</Text>
            <Text style={s.link}>Review application</Text>
          </Pressable>} />}
  </View>;
}

function ApplicationDetail({ application, api, onBack, onSaved }: {
  application: AdminApplication;
  api: ReturnType<typeof marketplaceApi>;
  onBack: () => void;
  onSaved: (value: Omit<AdminApplication, 'chef'>) => void;
}) {
  const [notes, setNotes] = useState(application.adminNotes ?? '');
  const [day, setDay] = useState(application.visitScheduledAt ? toDateKey(new Date(application.visitScheduledAt)) : '');
  const [time, setTime] = useState(application.visitScheduledAt
    ? new Date(application.visitScheduledAt).toTimeString().slice(0, 5) : '');
  const [address, setAddress] = useState<VisitAddress | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ApplicationReview | null>(null);
  const addressGeneration = useRef(0);
  const next = nextApplicationStatus(application.status);
  const blocker = publicationBlocker(application);

  const hideAddress = useCallback(() => {
    addressGeneration.current += 1;
    setAddress(null);
    setAddressLoading(false);
  }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') hideAddress();
    });
    return () => { addressGeneration.current += 1; subscription.remove(); };
  }, [hideAddress]);

  async function revealAddress() {
    const generation = ++addressGeneration.current;
    setAddressLoading(true);
    setError(null);
    try {
      const result = await api<VisitAddress>(`${queuePath}/${application.id}/address`, { cache: 'no-store' });
      if (generation === addressGeneration.current) setAddress(result);
    } catch (e) {
      if (generation === addressGeneration.current) setError(errorMessage(e));
    } finally {
      if (generation === addressGeneration.current) setAddressLoading(false);
    }
  }

  function prepare(status: ApplicationStatus, reschedule = false) {
    setError(null);
    try {
      if (notes.length > 2000) throw new Error('Staff notes must be 2,000 characters or fewer.');
      if (status === 'profile_setup' && blocker) throw new Error(blocker);
      const review: ApplicationReview = { status, expectedStatus: application.status, adminNotes: notes };
      if (status === 'visit_scheduled' && (application.status === 'submitted' || reschedule)) {
        review.visitScheduledAt = visitTimeToIso(day, time);
      }
      setConfirmation(review);
      hideAddress();
    } catch (e) { setError(errorMessage(e)); }
  }

  async function save() {
    if (!confirmation || saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api<Omit<AdminApplication, 'chef'>>(`${queuePath}/${application.id}`, {
        method: 'PATCH', body: JSON.stringify(confirmation),
      });
      onSaved(updated);
    } catch (e) {
      setConfirmation(null);
      setError(errorMessage(e));
    } finally { setSaving(false); }
  }

  return <ScrollView contentContainerStyle={s.detail} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
    <PrimaryButton label="Back to applications" secondary disabled={saving} onPress={onBack} />
    <View style={s.card}>
      <Text style={s.heading}>{application.chef.displayName}</Text>
      <Text style={s.body}>Applicant: {application.chef.user.name}</Text>
      <Text selectable style={s.body}>Email: {application.chef.user.email}</Text>
      <Text style={s.body}>Phone: {application.chef.user.phoneNumberLast4 ? `ending in ${application.chef.user.phoneNumberLast4}` : 'Not provided'}</Text>
      <Text style={s.reference}>Reference: {application.id}</Text>
      <Text style={s.status}>{applicationStatusLabels[application.status]}</Text>
      <Text style={s.body}>Submitted: {dateLabel(application.submittedAt)}</Text>
      <Text style={s.body}>Visit: {dateLabel(application.visitScheduledAt)}</Text>
      <Text style={s.body}>Interview: {dateLabel(application.interviewedAt)}</Text>
      <Text style={s.body}>Published: {dateLabel(application.profileSetupAt)}</Text>
    </View>
    <View style={s.card}>
      <Text style={s.heading}>Private applicant details and visit address</Text>
      <Text style={s.body}>View only to call the applicant and arrange an authorised meeting or visit. Each access is audited. Do not copy these details into staff notes or marketing content.</Text>
      {address ? <>
        {address.applicantDetails ? <>
          <Text selectable style={s.body}>Application phone: {address.applicantDetails.phoneNumber || 'Not provided'}</Text>
          <Text style={s.body}>Cooking experience: {address.applicantDetails.experienceYears === null ? 'Not provided' : `${address.applicantDetails.experienceYears} years`}</Text>
          <Text style={s.body}>Country of origin: {address.applicantDetails.countryOfOrigin || 'Not provided'}</Text>
          <Text style={s.body}>Call / meeting availability: {address.applicantDetails.meetingAvailability || 'Not provided'}</Text>
        </> : <Text style={s.body}>Additional applicant details were not collected for this older application. Contact the cook to confirm them.</Text>}
        <Text style={s.body}>{[address.line1, address.line2, address.city, address.region, address.postalCode, address.countryCode].filter(Boolean).join('\n') || 'Visit address not provided'}</Text>
        <PrimaryButton label="Hide applicant details and address" secondary onPress={hideAddress} />
      </> : <PrimaryButton label="View applicant details and address" secondary loading={addressLoading} disabled={saving} onPress={() => void revealAddress()} />}
    </View>
    <View style={s.card}>
      <Text style={s.heading}>Profile readiness</Text>
      {application.chef.profileImageUrl ? <Image source={{ uri: application.chef.profileImageUrl }} style={s.photo} accessibilityLabel="Cook profile photo" /> : null}
      <Text style={s.body}>Profile photo: {application.chef.profileImageUrl ? 'Added' : 'Missing'}</Text>
      <Text style={s.body}>Foods: {application.chef.menuEntries.length}</Text>
      {application.chef.menuEntries.map((item) => <Text key={item.id} style={s.body}>{item.name}</Text>)}
      <Text style={s.body}>{blocker ?? 'Photo and food requirements are met. Finish the visit and interview before publishing.'}</Text>
      <Text style={s.body}>The cook manages their own profile, menu, photos, and videos. Publication makes their profile visible to customers; separate safety and service eligibility checks still apply.</Text>
    </View>
    {(application.status === 'submitted' || application.status === 'visit_scheduled') ? <View style={s.card}>
      <Text style={s.heading}>{application.status === 'submitted' ? 'Schedule a home visit' : 'Reschedule visit'}</Text>
      <Text style={s.body}>Times use the device time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}). Enter the visit in that zone, especially if the cook lives elsewhere.</Text>
      <CalendarPicker value={day} onChange={setDay} minDate={new Date()} />
      <TextInput style={s.input} accessibilityLabel="Visit time in 24-hour format" placeholder="HH:MM (24-hour time)"
        value={time} onChangeText={setTime} maxLength={5} editable={!saving} />
      {application.status === 'visit_scheduled' ? <PrimaryButton label="Reschedule visit" disabled={saving} onPress={() => prepare('visit_scheduled', true)} /> : null}
    </View> : null}
    <View style={s.card}>
      <Text style={s.heading}>Private staff notes</Text>
      <TextInput accessibilityLabel="Private staff notes" style={[s.input, s.notes]} multiline maxLength={2000}
        value={notes} onChangeText={setNotes} editable={!saving} placeholder="Interview outcome and profile setup notes" />
      <PrimaryButton label="Save notes" secondary disabled={saving} onPress={() => prepare(application.status)} />
      {next ? <PrimaryButton label={next === 'visit_scheduled' ? 'Schedule visit' : next === 'interviewed' ? 'Mark interview completed' : 'Complete setup and publish'}
        disabled={saving || (next === 'profile_setup' && Boolean(blocker))} onPress={() => prepare(next)} /> : null}
      {next ? <PrimaryButton label="Reject application" secondary disabled={saving} onPress={() => prepare('rejected')} /> : null}
      {application.status === 'rejected' ? <Text style={s.body}>The cook may submit a new application. Staff cannot reopen it here.</Text> : null}
    </View>
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {confirmation ? <View style={s.confirmation} accessibilityLabel="Confirm application update">
      <Text style={s.heading}>Confirm update</Text>
      <Text style={s.body}>Save as: {applicationStatusLabels[confirmation.status]}.</Text>
      {confirmation.visitScheduledAt ? <Text style={s.body}>Visit: {dateLabel(confirmation.visitScheduledAt)}</Text> : null}
      {confirmation.status === 'profile_setup' ? <Text style={s.body}>This publishes the cook profile for customers to see.</Text> : null}
      {confirmation.status === 'rejected' ? <Text style={s.body}>This rejects the application and keeps the profile private.</Text> : null}
      <PrimaryButton label="Confirm and save" loading={saving} onPress={() => void save()} />
      <PrimaryButton label="Cancel update" secondary disabled={saving} onPress={() => setConfirmation(null)} />
    </View> : null}
  </ScrollView>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F8EEDD', width: '100%', maxWidth: 1000, alignSelf: 'center' },
  header: { padding: 20, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headerText: { flexGrow: 1 },
  eyebrow: { fontSize: 12, color: '#185A43', fontWeight: '800' },
  title: { fontSize: 28, fontWeight: '800', color: '#3A2E22' },
  heading: { fontSize: 19, fontWeight: '700', color: '#3A2E22' },
  body: { color: '#3A2E22', fontSize: 15, lineHeight: 22 },
  reference: { color: '#756C61', fontSize: 12 },
  status: { color: '#185A43', fontSize: 15, fontWeight: '700' },
  link: { color: '#185A43', fontWeight: '700', paddingVertical: 8 },
  controls: { paddingHorizontal: 20, gap: 12, paddingBottom: 12 },
  summary: { backgroundColor: '#E1F1E8', padding: 18, borderRadius: 16, gap: 8, minHeight: 44 },
  summaryCount: { color: '#185A43', fontSize: 32, fontWeight: '800' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { padding: 10, minHeight: 44, borderWidth: 1, borderColor: '#185A43', borderRadius: 20 },
  chipSelected: { backgroundColor: '#185A43' },
  chipSelectedText: { color: '#fff', fontSize: 15, lineHeight: 22 },
  input: { backgroundColor: '#fff', borderColor: '#CFC7BC', borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 48, color: '#3A2E22' },
  notes: { minHeight: 120, textAlignVertical: 'top' },
  loading: { padding: 24, gap: 10, alignItems: 'center' },
  list: { padding: 20, gap: 12 },
  sectionButtons: { paddingHorizontal: 20, gap: 8 },
  card: { backgroundColor: '#fff', padding: 18, borderRadius: 16, gap: 10 },
  detail: { padding: 20, gap: 16 },
  photo: { width: 100, height: 100, borderRadius: 12 },
  error: { color: '#9C2F1A', padding: 16, backgroundColor: '#FDEDE7' },
  notice: { color: '#185A43', padding: 16, backgroundColor: '#E1F1E8' },
  confirmation: { padding: 18, borderRadius: 16, borderWidth: 2, borderColor: '#185A43', backgroundColor: '#E1F1E8', gap: 12 },
});
