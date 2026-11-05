import { authenticatedFetch as fetch } from '../lib/session';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ChefPayoutSetup } from './ChefPayoutSetup';
import { BookingPaymentStatus } from './BookingPaymentStatus';
import { AccountVerification } from './AccountVerification';
import { Messaging, type MessagePartner } from './Messaging';
import { ChefVerificationChecklist } from './ChefVerificationChecklist';
import { SellerPhotos } from './SellerPhotos';
import { marketingContactRequiresOptIn } from '../lib/marketingRegions';
import { currencyForCountry, formatCurrency } from '../lib/currency';

type WorkspaceCountry = {
  id: string;
  name: string;
  flag: string;
  code?: string;
};

type ChefProfileDetails = {
  displayName: string;
  bio: string | null;
  city: string | null;
  state: string | null;
  countryCode: string | null;
  specialties: string[];
  languages: string[];
  serviceTypes: string[];
  serviceRadiusKm: number | null;
  profileImageUrl: string | null;
  coverImageUrl: string | null;
  serviceAreas: ChefServiceAreaDetails[];
};

type ChefApplication = {
  id: string;
  status: 'submitted' | 'visit_scheduled' | 'interviewed' | 'profile_setup' | 'rejected';
  submittedAt: string;
  visitScheduledAt: string | null;
  interviewedAt: string | null;
  profileSetupAt: string | null;
};

type ChefServiceAreaDetails = {
  city: string | null;
  state: string | null;
  countryCode: string | null;
  radiusKm: number;
  offersDelivery: boolean;
  offersPickup: boolean;
};

type MenuEntry = {
  id: string;
  name: string;
  description: string | null;
  knownIngredients: string[];
  majorAllergens: string[];
  crossContactRisks: string[];
  cuisineCountry: WorkspaceCountry | null;
};

type MenuTemplate = {
  id: string;
  name: string;
  description: string | null;
  serves: number | null;
  items: Array<{ menuEntry: MenuEntry }>;
};

type ChefBookingQuote = {
  id: string;
  status: string;
  amount: string | number;
  notes: string | null;
  createdAt: string;
};

type ChefBookingRequest = {
  id: string;
  status: string;
  serviceType: string;
  requestedDate: string | null;
  paymentHoldExpiresAt: string | null;
  chefCompletedAt: string | null;
  customerCompletedAt: string | null;
  durationMinutes: number | null;
  notes: string | null;
  disclosedAllergens: string[];
  dietaryRestrictions: string[];
  allergyReviewStatus: string;
  allergyResponseNote: string | null;
  budget: string | number | null;
  customer?: { id: string; name: string };
  quotes: ChefBookingQuote[];
};

type ChefSocialLinks = {
  instagramUrl: string | null;
  tiktokUrl: string | null;
  youtubeUrl: string | null;
  facebookUrl: string | null;
};

type MarketingContactPreference = {
  marketingContactSharing: boolean;
  marketingCountryCode: string | null;
  marketingContactSharingUpdatedAt: string | null;
};

type ChefWorkspaceProps = {
  token: string;
  countries: WorkspaceCountry[];
  apiBaseUrl: string;
  onSignOut: () => void;
};

const allergens = [
  'milk',
  'eggs',
  'fish',
  'crustacean_shellfish',
  'tree_nuts',
  'peanuts',
  'wheat',
  'soybeans',
  'sesame',
  'other',
];

const serviceOptions = [
  ['prepared_meals', 'Prepared meals'],
  ['bulk_meal_prep', 'Meal prep'],
  ['in_home_cooking', 'In-home cooking'],
  ['grocery_shopping', 'Grocery shopping'],
  ['special_event', 'Special events'],
  ['postpartum', 'Postpartum meals'],
  ['recurring', 'Recurring service'],
] as const;

function splitList(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

type ChefWorkspacePage = 'profile' | 'menu' | 'quotes' | 'messages' | 'verification' | 'payments' | 'policy';

export function ChefWorkspace({
  token,
  countries,
  apiBaseUrl,
  onSignOut,
}: ChefWorkspaceProps) {
  const [menu, setMenu] = useState<MenuEntry[]>([]);
  const [templates, setTemplates] = useState<MenuTemplate[]>([]);
  const [quoteRequests, setQuoteRequests] = useState<ChefBookingRequest[]>([]);
  const [quoteAmounts, setQuoteAmounts] = useState<Record<string, string>>({});
  const [quoteNotes, setQuoteNotes] = useState<Record<string, string>>({});
  const [allergyResponseNotes, setAllergyResponseNotes] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [crossContactRisks, setCrossContactRisks] = useState('');
  const [selectedAllergens, setSelectedAllergens] = useState<string[]>([]);
  const [cuisineCountryId, setCuisineCountryId] = useState<string | undefined>();
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [serves, setServes] = useState('');
  const [templateEntryIds, setTemplateEntryIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [chefCommissionBps, setChefCommissionBps] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bookingAddresses, setBookingAddresses] = useState<Record<string, string>>({});
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaCaption, setMediaCaption] = useState('');
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [socialLinks, setSocialLinks] = useState<ChefSocialLinks>({
    instagramUrl: null,
    tiktokUrl: null,
    youtubeUrl: null,
    facebookUrl: null,
  });
  const [marketingContactSharing, setMarketingContactSharing] = useState(false);
  const [marketingCountryCode, setMarketingCountryCode] = useState('');
  const [marketingPreferenceTouched, setMarketingPreferenceTouched] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileBio, setProfileBio] = useState('');
  const [profileCity, setProfileCity] = useState('');
  const [profileState, setProfileState] = useState('');
  const [profileCountryCode, setProfileCountryCode] = useState('');
  const [profileSpecialties, setProfileSpecialties] = useState('');
  const [profileLanguages, setProfileLanguages] = useState('');
  const [profileServiceTypes, setProfileServiceTypes] = useState<string[]>([]);
  const [profileServiceRadius, setProfileServiceRadius] = useState('25');
  const [profileImageUrl, setProfileImageUrl] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [offersDelivery, setOffersDelivery] = useState(false);
  const [offersPickup, setOffersPickup] = useState(false);
  const [profileServiceAreas, setProfileServiceAreas] = useState<ChefServiceAreaDetails[]>([]);
  const [application, setApplication] = useState<ChefApplication | null>(null);
  const [applicationAddressLine1, setApplicationAddressLine1] = useState('');
  const [applicationAddressLine2, setApplicationAddressLine2] = useState('');
  const [applicationAddressCity, setApplicationAddressCity] = useState('');
  const [applicationAddressRegion, setApplicationAddressRegion] = useState('');
  const [applicationAddressPostalCode, setApplicationAddressPostalCode] = useState('');
  const [applicationAddressCountryCode, setApplicationAddressCountryCode] = useState('');
  const [activePage, setActivePage] = useState<ChefWorkspacePage>('profile');
  const [chatPartner, setChatPartner] = useState<MessagePartner | null>(null);
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
    const body = await response.json();
    if (!response.ok) {
      const message = Array.isArray(body.message) ? body.message.join(' ') : body.message;
      throw new Error(message ?? `Request failed (${response.status}).`);
    }
    return body as T;
  }

  async function refresh() {
    setIsLoading(true);
    setError(null);
    try {
      const [entries, savedTemplates, savedSocialLinks, marketingPreference, savedProfile, savedQuoteRequests, payoutConfiguration, savedApplication] = await Promise.all([
        request<MenuEntry[]>('/chefs/me/menu'),
        request<MenuTemplate[]>('/chefs/me/menu-templates'),
        request<ChefSocialLinks>('/chefs/me/social-links'),
        request<MarketingContactPreference>('/auth/me/marketing-contact-preference'),
        request<ChefProfileDetails>('/chefs/me/profile'),
        request<ChefBookingRequest[]>('/quotes/requests'),
        request<{ chefCommissionBps: number }>('/payments/chef/connect/status'),
        request<ChefApplication | null>('/chefs/me/application'),
      ]);
      setMenu(entries);
      setTemplates(savedTemplates);
      setQuoteRequests(savedQuoteRequests);
      setApplication(savedApplication);
      setChefCommissionBps(payoutConfiguration.chefCommissionBps);
      setSocialLinks(savedSocialLinks);
      setProfileName(savedProfile.displayName);
      setProfileBio(savedProfile.bio ?? '');
      setProfileCity(savedProfile.city ?? '');
      setProfileState(savedProfile.state ?? '');
      setProfileCountryCode(savedProfile.countryCode ?? '');
      setProfileSpecialties(savedProfile.specialties.join(', '));
      setProfileLanguages(savedProfile.languages.join(', '));
      setProfileServiceTypes(savedProfile.serviceTypes);
      setProfileServiceRadius(String(savedProfile.serviceRadiusKm ?? 25));
      setProfileImageUrl(savedProfile.profileImageUrl ?? '');
      setCoverImageUrl(savedProfile.coverImageUrl ?? '');
      const serviceArea = savedProfile.serviceAreas[0];
      setProfileServiceAreas(savedProfile.serviceAreas);
      setOffersDelivery(Boolean(serviceArea?.offersDelivery));
      setOffersPickup(Boolean(serviceArea?.offersPickup));
      setMarketingCountryCode(marketingPreference.marketingCountryCode ?? '');
      const hasSavedPreference = Boolean(marketingPreference.marketingContactSharingUpdatedAt);
      setMarketingContactSharing(hasSavedPreference
        ? marketingPreference.marketingContactSharing
        : Boolean(marketingPreference.marketingCountryCode) &&
          !marketingContactRequiresOptIn(marketingPreference.marketingCountryCode ?? ''));
      setMarketingPreferenceTouched(hasSavedPreference && marketingPreference.marketingContactSharing);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your menu.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [token, apiBaseUrl]);

  // Keep new customer requests fresh without touching in-progress profile edits.
  useEffect(() => {
    if (activePage !== 'quotes') return undefined;
    const load = () =>
      void request<ChefBookingRequest[]>('/quotes/requests')
        .then(setQuoteRequests)
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not refresh bookings.'));
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [activePage, token, apiBaseUrl]);

  async function saveProfile() {
    const countryCode = profileCountryCode.trim().toUpperCase();
    const radiusKm = Number(profileServiceRadius);
    if (profileName.trim().length < 2) {
      setError('Enter a public cook or business name with at least 2 characters.');
      return;
    }
    if (!/^[A-Z]{2}$/.test(countryCode)) {
      setError('Enter a valid two-letter country code.');
      return;
    }
    if (!profileCity.trim()) {
      setError('Enter the city where you offer your cooking services.');
      return;
    }
    if (profileServiceTypes.length === 0) {
      setError('Choose at least one service you offer.');
      return;
    }
    if (!Number.isInteger(radiusKm) || radiusKm < 1 || radiusKm > 500) {
      setError('Enter a service radius between 1 and 500 km.');
      return;
    }
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      await request<ChefProfileDetails>('/chefs/me/profile', {
        method: 'POST',
        body: JSON.stringify({
          displayName: profileName.trim(),
          bio: profileBio.trim(),
          city: profileCity.trim(),
          state: profileState.trim(),
          countryCode,
          specialties: splitList(profileSpecialties),
          languages: splitList(profileLanguages),
          serviceTypes: profileServiceTypes,
          serviceRadiusKm: radiusKm,
          profileImageUrl: profileImageUrl.trim() || null,
          coverImageUrl: coverImageUrl.trim() || null,
        }),
      });
      await request('/chefs/me/service-areas', {
        method: 'PUT',
        body: JSON.stringify({
          areas: profileServiceAreas.length
            ? [
                {
                  city: profileCity.trim(),
                  state: profileState.trim(),
                  countryCode,
                  radiusKm,
                  offersDelivery,
                  offersPickup,
                },
                ...profileServiceAreas.slice(1),
              ]
            : [{
                city: profileCity.trim(),
                state: profileState.trim(),
                countryCode,
                radiusKm,
                offersDelivery,
                offersPickup,
              }],
        }),
      });
      setNotice(application?.status === 'profile_setup'
        ? 'Your public profile and service area have been saved.'
        : 'Your profile draft and service area have been saved. Customers will see your profile after AfroChop completes the visit and setup.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your cook profile.');
    } finally {
      setIsSaving(false);
    }
  }

  async function submitApplication() {
    if (!applicationAddressLine1.trim() || !applicationAddressCity.trim() ||
        !applicationAddressRegion.trim() || !applicationAddressPostalCode.trim() ||
        !/^[A-Za-z]{2}$/.test(applicationAddressCountryCode.trim())) {
      setError('Enter your complete visit address, including a two-letter country code.');
      return;
    }
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await request<ChefApplication>('/chefs/me/application', {
        method: 'POST',
        body: JSON.stringify({
          line1: applicationAddressLine1.trim(),
          line2: applicationAddressLine2.trim() || undefined,
          city: applicationAddressCity.trim(),
          region: applicationAddressRegion.trim(),
          postalCode: applicationAddressPostalCode.trim(),
          countryCode: applicationAddressCountryCode.trim().toUpperCase(),
        }),
      });
      setApplication(saved);
      setNotice('Application submitted. AfroChop will contact you to arrange a home visit.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not submit your application.');
    } finally {
      setIsSaving(false);
    }
  }

  async function saveMarketingPreference() {
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await request<{
        marketingContactSharing: boolean;
        exportStatus: string;
      }>('/auth/me/marketing-contact-preference', {
        method: 'PATCH',
        body: JSON.stringify({
          countryCode: marketingCountryCode.trim().toUpperCase(),
          enabled: marketingContactSharing,
          explicitConsent: marketingPreferenceTouched,
        }),
      });
      setMarketingContactSharing(saved.marketingContactSharing);
      setMarketingPreferenceTouched(saved.marketingContactSharing);
      setNotice(saved.exportStatus === 'not_configured'
        ? 'Preference saved. Contact-list syncing is not configured yet.'
        : saved.marketingContactSharing
          ? 'Your contact preference is saved.'
          : 'Your contact preference is saved and your sheet entry was removed.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your contact preference.');
    } finally {
      setIsSaving(false);
    }
  }

  async function addMenuEntry() {
    if (!name.trim()) {
      setError('Enter a dish or meal name before saving.');
      return;
    }
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      await request<MenuEntry>('/chefs/me/menu', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          cuisineCountryId,
          knownIngredients: splitList(ingredients),
          majorAllergens: selectedAllergens,
          crossContactRisks: splitList(crossContactRisks),
        }),
      });
      setName('');
      setDescription('');
      setIngredients('');
      setCrossContactRisks('');
      setSelectedAllergens([]);
      setNotice('Dish saved to your cook profile.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this dish.');
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteMenuEntry(entryId: string) {
    setError(null);
    try {
      await request<{ deleted: boolean }>(`/chefs/me/menu/${entryId}`, { method: 'DELETE' });
      setTemplateEntryIds((ids) => ids.filter((id) => id !== entryId));
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove this menu item.');
    }
  }

  async function saveTemplate() {
    if (!templateName.trim() || templateEntryIds.length === 0) {
      setError('Name your template and choose at least one menu item.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      await request<MenuTemplate>('/chefs/me/menu-templates', {
        method: 'POST',
        body: JSON.stringify({
          name: templateName.trim(),
          description: templateDescription.trim() || undefined,
          serves: serves ? Number(serves) : undefined,
          menuEntryIds: templateEntryIds,
        }),
      });
      setTemplateName('');
      setTemplateDescription('');
      setServes('');
      setTemplateEntryIds([]);
      setNotice('Reusable menu template saved.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this template.');
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteTemplate(templateId: string) {
    setError(null);
    try {
      await request<{ deleted: boolean }>(`/chefs/me/menu-templates/${templateId}`, {
        method: 'DELETE',
      });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove this template.');
    }
  }

  async function addFoodMedia() {
    let url: URL;
    try {
      url = new URL(mediaUrl.trim());
    } catch {
      setError('Enter a valid HTTPS image or video URL.');
      return;
    }
    if (url.protocol !== 'https:') {
      setError('Food media must use a secure HTTPS URL.');
      return;
    }
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      await request('/chefs/me/food-photos', {
        method: 'POST',
        body: JSON.stringify({
          imageUrl: url.toString(),
          mediaType,
          caption: mediaCaption.trim() || undefined,
        }),
      });
      setMediaUrl('');
      setMediaCaption('');
      setNotice(application?.status === 'profile_setup'
        ? `${mediaType === 'image' ? 'Photo' : 'Video'} added to your public food gallery.`
        : `${mediaType === 'image' ? 'Photo' : 'Video'} saved and will appear after your profile setup is complete.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add food media.');
    } finally {
      setIsSaving(false);
    }
  }

  async function saveSocialLinks() {
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await request<ChefSocialLinks>('/chefs/me/social-links', {
        method: 'PATCH',
        body: JSON.stringify({
          instagramUrl: socialLinks.instagramUrl?.trim() || null,
          tiktokUrl: socialLinks.tiktokUrl?.trim() || null,
          youtubeUrl: socialLinks.youtubeUrl?.trim() || null,
          facebookUrl: socialLinks.facebookUrl?.trim() || null,
        }),
      });
      setSocialLinks(saved);
      setNotice('Your social profile links have been saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save social links.');
    } finally {
      setIsSaving(false);
    }
  }

  async function markDeliveryComplete(bookingId: string) {
    setIsSaving(true);
    setError(null);
    try {
      await request(`/quotes/requests/${bookingId}/complete`, { method: 'PATCH' });
      setQuoteRequests(await request<ChefBookingRequest[]>('/quotes/requests'));
      setBookingAddresses((current) => { const next = { ...current }; delete next[bookingId]; return next; });
      setNotice('Delivery/service marked complete. The customer must confirm receipt before your funds are released.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not mark delivery complete.');
    } finally {
      setIsSaving(false);
    }
  }

  async function viewBookingAddress(bookingId: string) {
    setError(null);
    try {
      const address = await request<{ line1: string; line2: string | null; city: string; region: string; postalCode: string; countryCode: string }>(
        `/verification/bookings/${bookingId}/service-address`,
      );
      setBookingAddresses((current) => ({ ...current, [bookingId]: [address.line1, address.line2, address.city, address.region, address.postalCode, address.countryCode].filter(Boolean).join(', ') }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read service address.');
    }
  }

  async function sendQuote(booking: ChefBookingRequest) {
    const amountText = (quoteAmounts[booking.id] ?? '').trim();
    const amount = Number(amountText);
    if (!/^\d+(?:\.\d{0,2})?$/.test(amountText) || !Number.isFinite(amount) || amount <= 0) {
      setError('Enter a quote amount greater than $0 with no more than two decimal places.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      await request<ChefBookingQuote>(`/quotes/${booking.id}/chef-quote`, {
        method: 'POST',
        body: JSON.stringify({
          amount,
          notes: quoteNotes[booking.id]?.trim() || undefined,
        }),
      });
      setQuoteAmounts((current) => ({ ...current, [booking.id]: '' }));
      setQuoteNotes((current) => ({ ...current, [booking.id]: '' }));
      setNotice('Your quote was sent to the customer. AfroChop will notify them to review it.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send this quote.');
    } finally {
      setIsSaving(false);
    }
  }

  async function respondToAllergyRequest(booking: ChefBookingRequest, canAccommodate: boolean) {
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      await request(`/quotes/requests/${booking.id}/allergy-response`, {
        method: 'PATCH',
        body: JSON.stringify({
          canAccommodate,
          responseNote: allergyResponseNotes[booking.id]?.trim() || undefined,
        }),
      });
      setNotice(canAccommodate
        ? 'Allergy disclosure accepted. You can now prepare a quote.'
        : 'The customer was notified that you cannot safely accommodate this request.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not respond to the allergy disclosure.');
    } finally {
      setIsSaving(false);
    }
  }

  function toggleAllergen(allergen: string) {
    setSelectedAllergens((current) => current.includes(allergen)
      ? current.filter((item) => item !== allergen)
      : [...current, allergen]);
  }

  function toggleTemplateEntry(entryId: string) {
    setTemplateEntryIds((current) => current.includes(entryId)
      ? current.filter((id) => id !== entryId)
      : [...current, entryId]);
  }

  const exampleCurrency = currencyForCountry(profileCountryCode);
  const exampleSaleCents = 10_000;
  const exampleCommissionCents = chefCommissionBps === null
    ? null
    : Math.round(exampleSaleCents * chefCommissionBps / 10_000);

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="on-drag">
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>CHEF WORKSPACE</Text>
          <Text style={styles.title}>
            {activePage === 'profile' ? application?.status === 'profile_setup' ? 'Your public profile' : 'Your profile draft'
              : activePage === 'menu' ? 'Your menu'
                : activePage === 'quotes' ? 'Quote requests'
                : activePage === 'messages' ? 'Messages'
                : activePage === 'verification' ? 'Verification'
                  : activePage === 'payments' ? 'Payment setup'
                    : 'Commission policy'}
          </Text>
          <Text style={styles.subtitle}>
            {activePage === 'profile' ? 'Show customers what you cook, where you serve, and how to find you.'
              : activePage === 'menu' ? 'Build your dishes and reusable menus for customer requests.'
                : activePage === 'quotes' ? 'Review customer requests and send a price directly to the customer.'
                : activePage === 'messages' ? 'Chat with customers to agree on details before you quote.'
                : activePage === 'verification' ? 'Review your identity and business verification progress.'
                  : activePage === 'payments' ? 'Connect and manage your payout account.'
                    : 'See how AfroChop’s sales commission works.'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showWorkspaceMenu ? 'Close chef workspace menu' : 'Open chef workspace menu'}
          accessibilityState={{ expanded: showWorkspaceMenu }}
          onPress={() => setShowWorkspaceMenu((open) => !open)}
          style={styles.menuButton}
        >
          <Text style={styles.menuButtonIcon}>{showWorkspaceMenu ? '×' : '☰'}</Text>
          <Text style={styles.menuButtonLabel}>Menu</Text>
        </Pressable>
      </View>

      {showWorkspaceMenu ? (
        <View style={styles.workspaceMenu}>
          <Text style={styles.menuHeading}>Workspace</Text>
          {([
            ['profile', 'Profile setup', 'Public profile and marketing details'],
            ['menu', 'Menu & dishes', 'Dishes, ingredients and meal templates'],
            ['quotes', 'Quote requests', 'Review requests and send customers a quote'],
            ['messages', 'Messages', 'Chat and negotiate with customers'],
            ['verification', 'Verification', 'Identity and permit review'],
            ['payments', 'Payment setup', 'Stripe payouts'],
            ['policy', 'Commission policy', 'AfroChop sales commission'],
          ] as const).map(([page, label, detail]) => (
            <Pressable
              key={page}
              accessibilityRole="button"
              accessibilityState={{ selected: activePage === page }}
              onPress={() => {
                if (page === 'messages') setChatPartner(null);
                setActivePage(page);
                setShowWorkspaceMenu(false);
                setError(null);
                setNotice(null);
              }}
              style={[styles.menuItem, activePage === page && styles.menuItemSelected]}
            >
              <Text style={styles.menuItemTitle}>{label}</Text>
              <Text style={styles.menuItemDetail}>{detail}</Text>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" onPress={onSignOut} style={[styles.menuItem, styles.menuSignOut]}>
            <Text style={styles.menuSignOutText}>Sign out</Text>
          </Pressable>
        </View>
      ) : null}

      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {isLoading ? <ActivityIndicator color="#185A43" /> : null}

      {activePage === 'verification' ? <View style={styles.card}>
        <Text style={styles.sectionTitle}>Your verification progress</Text>
        <Text style={styles.helper}>
          New cook profiles remain under review until AfroChop completes required checks.
        </Text>
        <ChefVerificationChecklist accessToken={token} />
        <AccountVerification token={token} apiBaseUrl={apiBaseUrl} customer={false} />
      </View> : null}
      {activePage === 'payments' ? <ChefPayoutSetup accessToken={token} /> : null}

      {activePage === 'policy' ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>AfroChop sales commission</Text>
          {chefCommissionBps !== null && exampleCommissionCents !== null ? (
            <>
              <Text style={styles.helper}>
                AfroChop deducts {chefCommissionBps / 100}% of your quoted sale amount.
                The rate and your share are saved at checkout.
              </Text>
              <View style={styles.commissionExample}>
                <Text style={styles.sectionTitle}>Example sale ({exampleCurrency})</Text>
                <View style={styles.commissionRow}>
                  <Text style={styles.commissionLabel}>Your quoted sale</Text>
                  <Text style={styles.commissionAmount}>
                    {formatCurrency(exampleSaleCents / 100, exampleCurrency)}
                  </Text>
                </View>
                <View style={styles.commissionRow}>
                  <Text style={styles.commissionLabel}>AfroChop fee ({chefCommissionBps / 100}%)</Text>
                  <Text style={styles.commissionAmount}>
                    -{formatCurrency(exampleCommissionCents / 100, exampleCurrency)}
                  </Text>
                </View>
                <View style={[styles.commissionRow, styles.commissionTotal]}>
                  <Text style={styles.commissionAmount}>Your share</Text>
                  <Text style={styles.commissionAmount}>
                    {formatCurrency((exampleSaleCents - exampleCommissionCents) / 100, exampleCurrency)}
                  </Text>
                </View>
                <Text style={styles.helper}>Illustration only, not a balance or payout guarantee.</Text>
              </View>
            </>
          ) : (
            <Text style={styles.helper}>
              {isLoading ? 'Loading your commission rate...' : 'Your commission rate could not be loaded. Refresh before relying on an estimate.'}
            </Text>
          )}
          <Text style={styles.fieldLabel}>Fees and adjustments</Text>
          <Text style={styles.helper}>
            AfroChop covers Stripe payment-processing fees; they are not deducted again from your share.
            Any separately disclosed customer marketplace fee is not part of your quoted sale.
            Refunds, disputes and transfer reversals can affect the final payout.
          </Text>
          <Text style={styles.fieldLabel}>When you get paid</Text>
          <Text style={styles.helper}>
            The customer pays the full quote at checkout. Your share is released to your
            connected Stripe account after you mark the service complete and the customer confirms receipt.
            Open refund reviews or unresolved disputes can delay release. Stripe manages bank
            payout timing; a transfer does not mean the money has reached your bank.
          </Text>
          <Text style={styles.helper}>
            Stripe identity checks and payout-account setup are managed separately in Payment setup.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setActivePage('payments')}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryText}>Manage payout setup</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={isLoading}
            onPress={() => void refresh()}
            style={[styles.secondaryButton, isLoading && styles.disabled]}
          >
            <Text style={styles.secondaryText}>Refresh commission rate</Text>
          </Pressable>
        </View>
      ) : null}

      {activePage === 'profile' ? (
      <>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Cook application and home visit</Text>
        {application?.status === 'profile_setup' ? (
          <Text style={styles.helper}>
            Your profile is live and customers can discover you. Keep updating your profile and sharing new photos and videos to market your food.
          </Text>
        ) : application?.status === 'submitted' ? (
          <Text style={styles.helper}>
            Application received. Your profile is private while AfroChop arranges a visit to interview you and help set up your profile.
          </Text>
        ) : application?.status === 'visit_scheduled' ? (
          <Text style={styles.helper}>
            Your home visit is scheduled
            {application.visitScheduledAt ? ` for ${new Date(application.visitScheduledAt).toLocaleString()}` : ''}.
            Your profile will stay private until the visit, interview, and profile setup are complete.
          </Text>
        ) : application?.status === 'interviewed' ? (
          <Text style={styles.helper}>
            Your interview is complete. AfroChop is setting up your profile; it will become visible to customers when setup is finished.
          </Text>
        ) : (
          <>
            {application?.status === 'rejected' ? (
              <Text style={styles.helper}>
                Your previous application was not approved. Update your visit address below to submit a new application.
              </Text>
            ) : (
              <Text style={styles.helper}>
                Apply to join AfroChop. An authorised team member will visit this address to interview you and help set up your profile.
                Your exact address is encrypted and only shared with authorised staff for arranging the visit.
              </Text>
            )}
            <TextInput
              accessibilityLabel="Visit street address"
              placeholder="Street address"
              value={applicationAddressLine1}
              onChangeText={setApplicationAddressLine1}
              maxLength={200}
              style={styles.input}
            />
            <TextInput
              accessibilityLabel="Visit apartment, suite or unit"
              placeholder="Apartment, suite or unit (optional)"
              value={applicationAddressLine2}
              onChangeText={setApplicationAddressLine2}
              maxLength={200}
              style={styles.input}
            />
            <TextInput
              accessibilityLabel="Visit city"
              placeholder="City"
              value={applicationAddressCity}
              onChangeText={setApplicationAddressCity}
              maxLength={100}
              style={styles.input}
            />
            <TextInput
              accessibilityLabel="Visit state, province or region"
              placeholder="State, province or region"
              value={applicationAddressRegion}
              onChangeText={setApplicationAddressRegion}
              maxLength={100}
              style={styles.input}
            />
            <TextInput
              accessibilityLabel="Visit postal or ZIP code"
              placeholder="Postal or ZIP code"
              value={applicationAddressPostalCode}
              onChangeText={setApplicationAddressPostalCode}
              maxLength={32}
              style={styles.input}
            />
            <TextInput
              accessibilityLabel="Visit country code"
              placeholder="Country code (2 letters)"
              autoCapitalize="characters"
              value={applicationAddressCountryCode}
              onChangeText={setApplicationAddressCountryCode}
              maxLength={2}
              style={styles.input}
            />
            <Pressable
              accessibilityRole="button"
              disabled={isSaving}
              onPress={() => void submitApplication()}
              style={[styles.primaryButton, isSaving && styles.disabled]}
            >
              <Text style={styles.primaryText}>{isSaving ? 'Submitting…' : 'Submit cook application'}</Text>
            </Pressable>
          </>
        )}
      </View>
      <SellerPhotos apiBaseUrl={apiBaseUrl} token={token}
        profileImageUrl={profileImageUrl || null} onProfileChanged={setProfileImageUrl}
        isProfilePublished={application?.status === 'profile_setup'} />
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Profile details</Text>
        <Text style={styles.helper}>
          {application?.status === 'profile_setup'
            ? 'Update your public details at any time. Changes are saved to the profile customers see.'
            : 'Build your profile draft. It will become visible to customers after the AfroChop visit and profile setup.'}
        </Text>
        <TextInput
          accessibilityLabel="Public cook or business name"
          placeholder="Public cook or business name"
          value={profileName}
          onChangeText={setProfileName}
          style={styles.input}
        />
        <TextInput
          accessibilityLabel="Profile biography"
          placeholder="Tell customers about your food, experience and story"
          value={profileBio}
          onChangeText={setProfileBio}
          multiline
          style={[styles.input, styles.multiline]}
        />
        <TextInput
          accessibilityLabel="Cuisine specialties"
          placeholder="Cuisine specialties (comma separated)"
          value={profileSpecialties}
          onChangeText={setProfileSpecialties}
          style={styles.input}
        />
        <TextInput
          accessibilityLabel="Languages spoken"
          placeholder="Languages spoken (comma separated)"
          value={profileLanguages}
          onChangeText={setProfileLanguages}
          style={styles.input}
        />
        <Text style={styles.fieldLabel}>Services offered</Text>
        <View style={styles.chipWrap}>
          {serviceOptions.map(([value, label]) => {
            const selected = profileServiceTypes.includes(value);
            return (
              <Pressable
                key={value}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                onPress={() => setProfileServiceTypes((current) => selected
                  ? current.filter((item) => item !== value)
                  : [...current, value])}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.fieldLabel}>Service location</Text>
        <TextInput
          accessibilityLabel="Service country code"
          autoCapitalize="characters"
          maxLength={2}
          placeholder="Two-letter country code (for example US)"
          value={profileCountryCode}
          onChangeText={setProfileCountryCode}
          style={styles.input}
        />
        <TextInput
          accessibilityLabel="Service city"
          placeholder="City"
          value={profileCity}
          onChangeText={setProfileCity}
          style={styles.input}
        />
        <TextInput
          accessibilityLabel="Service state or region"
          placeholder="State or region"
          value={profileState}
          onChangeText={setProfileState}
          style={styles.input}
        />
        <TextInput
          accessibilityLabel="Service radius in kilometers"
          keyboardType="number-pad"
          placeholder="Service radius in km"
          value={profileServiceRadius}
          onChangeText={setProfileServiceRadius}
          style={styles.input}
        />
        {([
          ['offersPickup', offersPickup, setOffersPickup, 'Offer pickup'],
          ['offersDelivery', offersDelivery, setOffersDelivery, 'Offer delivery'],
        ] as const).map(([key, selected, update, label]) => (
          <Pressable
            key={key}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            onPress={() => update((value) => !value)}
            style={styles.templateChoice}
          >
            <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
              {selected ? <Text style={styles.checkMark}>✓</Text> : null}
            </View>
            <Text style={styles.helper}>{label}</Text>
          </Pressable>
        ))}
        <TextInput
          accessibilityLabel="Profile photo URL"
          autoCapitalize="none"
          keyboardType="url"
          placeholder="Profile photo URL (HTTPS)"
          value={profileImageUrl}
          onChangeText={setProfileImageUrl}
          style={styles.input}
        />
        <TextInput
          accessibilityLabel="Cover photo URL"
          autoCapitalize="none"
          keyboardType="url"
          placeholder="Cover photo URL (HTTPS)"
          value={coverImageUrl}
          onChangeText={setCoverImageUrl}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          disabled={isSaving}
          onPress={() => void saveProfile()}
          style={[styles.primaryButton, isSaving && styles.disabled]}
        >
          <Text style={styles.primaryText}>
            {isSaving ? 'Saving…' : application?.status === 'profile_setup' ? 'Save public profile' : 'Save profile draft'}
          </Text>
        </Pressable>
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Promotional contact preference</Text>
        <Text style={styles.helper}>
          Choose your country of residence. European and Canadian cooks are added only after an explicit opt-in; elsewhere sharing is enabled by default and can be turned off.
        </Text>
        <TextInput
          accessibilityLabel="Country of residence code"
          autoCapitalize="characters"
          maxLength={2}
          onChangeText={(value) => {
            const normalized = value.trim().toUpperCase();
            setMarketingCountryCode(normalized);
            if (normalized.length === 2) {
              setMarketingContactSharing(!marketingContactRequiresOptIn(normalized));
              setMarketingPreferenceTouched(false);
            }
          }}
          placeholder="Country of residence (for example, US or CA)"
          value={marketingCountryCode}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: marketingContactSharing }}
          onPress={() => {
            setMarketingContactSharing((current) => !current);
            setMarketingPreferenceTouched(true);
          }}
          style={styles.templateChoice}
        >
          <View style={[styles.checkbox, marketingContactSharing && styles.checkboxSelected]}>
            {marketingContactSharing ? <Text style={styles.checkMark}>✓</Text> : null}
          </View>
          <Text style={styles.helper}>
            {marketingContactRequiresOptIn(marketingCountryCode)
              ? 'Optional: I agree to share my name, email, and phone for AfroChop promotional updates.'
              : 'Share my name, email, and phone for AfroChop promotional updates. Uncheck to opt out.'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={isSaving}
          onPress={() => void saveMarketingPreference()}
          style={[styles.primaryButton, isSaving && styles.disabled]}
        >
          <Text style={styles.primaryText}>{isSaving ? 'Saving…' : 'Save contact preference'}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Market your food</Text>
        <Text style={styles.helper}>
          Add a public HTTPS link to an image or short video hosted by your preferred media service.
        </Text>
        <View style={styles.mediaTypeRow}>
          {(['image', 'video'] as const).map((kind) => (
            <Pressable
              key={kind}
              accessibilityRole="radio"
              accessibilityState={{ selected: mediaType === kind }}
              onPress={() => setMediaType(kind)}
              style={[styles.mediaTypeChip, mediaType === kind && styles.mediaTypeChipSelected]}
            >
              <Text style={[styles.mediaTypeText, mediaType === kind && styles.mediaTypeTextSelected]}>
                {kind === 'image' ? 'Photo' : 'Short video'}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          accessibilityLabel={mediaType === 'image' ? 'Food photo URL' : 'Food video URL'}
          autoCapitalize="none"
          keyboardType="url"
          placeholder={mediaType === 'image' ? 'https://example.com/food-photo.jpg' : 'https://example.com/food-video.mp4'}
          value={mediaUrl}
          onChangeText={setMediaUrl}
          style={styles.input}
        />
        <TextInput
          accessibilityLabel="Food media caption"
          placeholder="Caption (optional)"
          value={mediaCaption}
          onChangeText={setMediaCaption}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          disabled={isSaving}
          onPress={() => void addFoodMedia()}
          style={[styles.primaryButton, isSaving && styles.disabled]}
        >
          <Text style={styles.primaryText}>{isSaving ? 'Adding…' : 'Add to food gallery'}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Connect your social profiles</Text>
        <Text style={styles.helper}>
          Share your food and cooking stories. Customers can visit these public profiles; social links do not represent AfroChop verification.
        </Text>
        {([
          ['instagramUrl', 'Instagram', 'https://instagram.com/yourname'],
          ['tiktokUrl', 'TikTok', 'https://tiktok.com/@yourname'],
          ['youtubeUrl', 'YouTube', 'https://youtube.com/@yourchannel'],
          ['facebookUrl', 'Facebook', 'https://facebook.com/yourpage'],
        ] as const).map(([key, label, placeholder]) => (
          <TextInput
            key={key}
            accessibilityLabel={`${label} profile URL`}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onChangeText={(value) => setSocialLinks((current) => ({ ...current, [key]: value }))}
            placeholder={placeholder}
            value={socialLinks[key] ?? ''}
            style={styles.input}
          />
        ))}
        <Pressable
          accessibilityRole="button"
          disabled={isSaving}
          onPress={() => void saveSocialLinks()}
          style={[styles.primaryButton, isSaving && styles.disabled]}
        >
          <Text style={styles.primaryText}>{isSaving ? 'Saving…' : 'Save social links'}</Text>
        </Pressable>
      </View>
      </>
      ) : null}

      {activePage === 'messages' ? (
        <View style={{ height: 560, borderRadius: 16, overflow: 'hidden' }}>
          <Messaging
            key={chatPartner?.id ?? 'inbox'}
            token={token}
            apiBaseUrl={apiBaseUrl}
            initialPartner={chatPartner}
            onBack={() => {
              setChatPartner(null);
              setActivePage(chatPartner ? 'quotes' : 'profile');
            }}
          />
        </View>
      ) : null}

      {activePage === 'quotes' ? (
      <>
      {isLoading ? (
        <View style={styles.card}>
          <ActivityIndicator color="#185A43" />
          <Text style={styles.helper}>Loading your quote requests…</Text>
        </View>
      ) : quoteRequests.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>No quote requests yet</Text>
          <Text style={styles.helper}>New customer requests will appear here. You can review the details and send your quote from this page.</Text>
        </View>
      ) : quoteRequests
        .map((booking) => {
          const latestQuote = booking.quotes[0];
          const quoteAmount = Number(quoteAmounts[booking.id] ?? '');
          const canShowEstimate = Number.isFinite(quoteAmount) && quoteAmount > 0 && chefCommissionBps !== null;
          const commission = canShowEstimate && chefCommissionBps !== null ? Math.round(quoteAmount * chefCommissionBps / 100) / 100 : 0;
          const estimatedPayout = canShowEstimate ? quoteAmount - commission : 0;

          return (
            <View key={booking.id} style={styles.card}>
              <Text style={styles.sectionTitle}>
                {serviceOptions.find(([service]) => service === booking.serviceType)?.[1] ?? booking.serviceType.replaceAll('_', ' ')}
              </Text>
              <Text style={styles.helper}>
                {booking.requestedDate
                  ? new Date(booking.requestedDate).toLocaleString()
                  : 'Date not provided'}
                {booking.durationMinutes ? ` · ${booking.durationMinutes} minutes` : ''}
              </Text>
              {booking.status === 'awaiting_payment' && booking.paymentHoldExpiresAt ? (
                <Text style={styles.helper}>
                  Customer payment hold ends {new Date(booking.paymentHoldExpiresAt).toLocaleString()}.
                </Text>
              ) : null}
              {booking.serviceType === 'in_home_cooking' && ['confirmed', 'in_progress'].includes(booking.status) ? (
                <>
                  <Pressable accessibilityRole="button" onPress={() => void viewBookingAddress(booking.id)} style={styles.secondaryButton}>
                    <Text style={styles.secondaryText}>View verified service address</Text>
                  </Pressable>
                  {bookingAddresses[booking.id] ? <Text style={styles.helper}>{bookingAddresses[booking.id]}</Text> : null}
                </>
              ) : null}
              {['confirmed', 'in_progress'].includes(booking.status) ? (
                booking.chefCompletedAt ? (
                  <Text style={styles.helper}>Delivery/service marked complete. Waiting for the customer to confirm receipt before your funds are released.</Text>
                ) : (
                  <Pressable accessibilityRole="button" disabled={isSaving} style={styles.primaryButton}
                    onPress={() => void markDeliveryComplete(booking.id)}>
                    <Text style={styles.primaryText}>Mark delivery / service complete</Text>
                  </Pressable>
                )
              ) : null}
              {['confirmed', 'in_progress', 'completed', 'disputed', 'cancelled'].includes(booking.status) ? (
                <BookingPaymentStatus bookingId={booking.id} token={token} apiBaseUrl={apiBaseUrl} customer={false} completed={booking.status === 'completed'} />
              ) : null}
              {booking.customer ? (
                <>
                  <Text style={styles.helper}>Customer: {booking.customer.name}</Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      const customer = booking.customer;
                      if (!customer) return;
                      setChatPartner({ id: customer.id, name: customer.name });
                      setActivePage('messages');
                    }}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryText}>💬 Message customer</Text>
                  </Pressable>
                </>
              ) : null}
              {booking.notes ? <Text style={styles.helper}>Customer notes: {booking.notes}</Text> : null}
              {booking.budget !== null ? (
                <Text style={styles.helper}>Customer budget: ${Number(booking.budget).toFixed(2)}</Text>
              ) : null}
              {booking.disclosedAllergens.length > 0 ? (
                <Text style={styles.allergenText}>
                  Disclosed allergens: {booking.disclosedAllergens.map((item) => item.replaceAll('_', ' ')).join(', ')}
                </Text>
              ) : null}
              {booking.dietaryRestrictions.length > 0 ? (
                <Text style={styles.helper}>Dietary requests: {booking.dietaryRestrictions.join(', ')}</Text>
              ) : null}
              {booking.allergyResponseNote ? (
                <Text style={styles.helper}>Your allergy response: {booking.allergyResponseNote}</Text>
              ) : null}

              {booking.allergyReviewStatus === 'pending' ? (
                <>
                  <Text style={styles.fieldLabel}>Review the allergy disclosure before quoting</Text>
                  <Text style={styles.helper}>
                    Confirm only if you can safely accommodate these allergens and prevent cross-contact. Declining will cancel this request.
                  </Text>
                  <TextInput
                    accessibilityLabel="Allergy response note"
                    placeholder="Note for the customer (optional)"
                    value={allergyResponseNotes[booking.id] ?? ''}
                    onChangeText={(value) => setAllergyResponseNotes((current) => ({ ...current, [booking.id]: value }))}
                    multiline
                    style={[styles.input, styles.multiline]}
                  />
                  <Pressable
                    accessibilityRole="button"
                    disabled={isSaving}
                    onPress={() => void respondToAllergyRequest(booking, true)}
                    style={[styles.primaryButton, isSaving && styles.disabled]}
                  >
                    <Text style={styles.primaryText}>{isSaving ? 'Saving…' : 'I can safely accommodate'}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isSaving}
                    onPress={() => void respondToAllergyRequest(booking, false)}
                    style={[styles.secondaryButton, isSaving && styles.disabled]}
                  >
                    <Text style={styles.secondaryText}>I cannot safely accommodate</Text>
                  </Pressable>
                </>
              ) : latestQuote ? (
                <>
                  <Text style={styles.quoteSummary}>
                    Quote sent: ${Number(latestQuote.amount).toFixed(2)}
                    {latestQuote.status === 'pending'
                      ? ' · Awaiting customer response'
                      : latestQuote.status === 'accepted'
                        ? ` · Accepted by customer | ${booking.status.replaceAll('_', ' ')}`
                        : ` · ${latestQuote.status}`}
                  </Text>
                  {latestQuote.notes ? <Text style={styles.helper}>Quote details: {latestQuote.notes}</Text> : null}
                </>
              ) : ['requested', 'quoted'].includes(booking.status) ? (
                <>
                  <TextInput
                    accessibilityLabel="Quote amount in dollars"
                    keyboardType="decimal-pad"
                    placeholder="Your quote amount ($)"
                    value={quoteAmounts[booking.id] ?? ''}
                    onChangeText={(value) => setQuoteAmounts((current) => ({ ...current, [booking.id]: value }))}
                    style={styles.input}
                  />
                  <TextInput
                    accessibilityLabel="Quote details for customer"
                    placeholder="Details for the customer (optional)"
                    value={quoteNotes[booking.id] ?? ''}
                    onChangeText={(value) => setQuoteNotes((current) => ({ ...current, [booking.id]: value }))}
                    multiline
                    style={[styles.input, styles.multiline]}
                  />
                  {canShowEstimate ? (
                    <Text style={styles.quoteSummary}>
                      Estimated commission: ${commission.toFixed(2)} · Estimated payout: ${estimatedPayout.toFixed(2)} before any other applicable fees.
                    </Text>
                  ) : null}
                  <Text style={styles.commissionNotice}>
                    AfroChop deducts its configured commission. The rate is snapshotted at checkout; your share is held until the customer confirms receipt. Review the estimated payout before quoting.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isSaving}
                    onPress={() => void sendQuote(booking)}
                    style={[styles.primaryButton, isSaving && styles.disabled]}
                  >
                    <Text style={styles.primaryText}>{isSaving ? 'Sending quote…' : 'Send quote to customer'}</Text>
                  </Pressable>
                </>
              ) : <Text style={styles.helper}>Booking: {booking.status.replaceAll('_', ' ')}</Text>}
            </View>
          );
        })}
      </>
      ) : null}

      {activePage === 'menu' ? (
      <>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Add a dish or meal</Text>
        <TextInput
          accessibilityLabel="Dish or meal name"
          placeholder="Dish or meal name"
          value={name}
          onChangeText={setName}
          style={styles.input}
        />
        <TextInput
          accessibilityLabel="Dish description"
          placeholder="Description for customers"
          value={description}
          onChangeText={setDescription}
          multiline
          style={[styles.input, styles.multiline]}
        />
        <Text style={styles.fieldLabel}>Cuisine country</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipList}>
          {countries.map((country) => (
            <Pressable
              key={country.id}
              accessibilityRole="button"
              accessibilityState={{ selected: cuisineCountryId === country.id }}
              onPress={() => setCuisineCountryId((current) =>
                current === country.id ? undefined : country.id)}
              style={[styles.chip, cuisineCountryId === country.id && styles.chipSelected]}
            >
              <Text style={[styles.chipText, cuisineCountryId === country.id && styles.chipTextSelected]}>
                {country.flag} {country.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <TextInput
          accessibilityLabel="Known ingredients separated by commas"
          placeholder="Known ingredients (comma separated)"
          value={ingredients}
          onChangeText={setIngredients}
          style={styles.input}
        />
        <Text style={styles.fieldLabel}>Known major allergens</Text>
        <View style={styles.chipWrap}>
          {allergens.map((allergen) => {
            const selected = selectedAllergens.includes(allergen);
            return (
              <Pressable
                key={allergen}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                onPress={() => toggleAllergen(allergen)}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {allergen.replaceAll('_', ' ')}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          accessibilityLabel="Known cross-contact risks"
          placeholder="Known cross-contact risks (comma separated)"
          value={crossContactRisks}
          onChangeText={setCrossContactRisks}
          style={styles.input}
        />
        <Text style={styles.helper}>
          Ingredient and allergen details help customers ask informed questions. Never promise allergen-free food without a verified basis.
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={isSaving}
          onPress={() => void addMenuEntry()}
          style={[styles.primaryButton, isSaving && styles.disabled]}
        >
          <Text style={styles.primaryText}>{isSaving ? 'Saving…' : 'Save dish to menu'}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Your dishes</Text>
        {menu.length === 0 && !isLoading ? (
          <Text style={styles.helper}>Your saved dishes will appear here.</Text>
        ) : menu.map((entry) => (
          <View key={entry.id} style={styles.listItem}>
            <View style={styles.listCopy}>
              <Text style={styles.itemName}>{entry.name}</Text>
              <Text style={styles.helper}>
                {entry.cuisineCountry?.name ?? 'Cuisine not specified'}
                {entry.description ? ` · ${entry.description}` : ''}
              </Text>
              <Text style={styles.allergenText}>
                Allergens: {entry.majorAllergens.length ? entry.majorAllergens.join(', ') : 'None listed'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete ${entry.name}`}
              onPress={() => void deleteMenuEntry(entry.id)}
              style={styles.deleteButton}
            >
              <Text style={styles.deleteText}>Remove</Text>
            </Pressable>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Save a reusable menu template</Text>
        <Text style={styles.helper}>
          Build a package for a large party, family gathering, or other repeat order. Your quote is set with the customer.
        </Text>
        <TextInput
          accessibilityLabel="Template name"
          placeholder="Template name (for example, Large Party Feast)"
          value={templateName}
          onChangeText={setTemplateName}
          style={styles.input}
        />
        <TextInput
          accessibilityLabel="Template description"
          placeholder="Describe the occasion or package"
          value={templateDescription}
          onChangeText={setTemplateDescription}
          multiline
          style={[styles.input, styles.multiline]}
        />
        <TextInput
          accessibilityLabel="Number of people served"
          placeholder="Serves how many people? (optional)"
          value={serves}
          onChangeText={setServes}
          keyboardType="number-pad"
          style={styles.input}
        />
        <Text style={styles.fieldLabel}>Choose dishes for this template</Text>
        {menu.map((entry) => {
          const selected = templateEntryIds.includes(entry.id);
          return (
            <Pressable
              key={entry.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              onPress={() => toggleTemplateEntry(entry.id)}
              style={styles.templateChoice}
            >
              <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                {selected ? <Text style={styles.checkMark}>✓</Text> : null}
              </View>
              <Text style={styles.itemName}>{entry.name}</Text>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          disabled={isSaving}
          onPress={() => void saveTemplate()}
          style={[styles.primaryButton, isSaving && styles.disabled]}
        >
          <Text style={styles.primaryText}>{isSaving ? 'Saving…' : 'Save menu template'}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Saved templates</Text>
        {templates.length === 0 && !isLoading ? (
          <Text style={styles.helper}>Your party and occasion templates will appear here.</Text>
        ) : templates.map((template) => (
          <View key={template.id} style={styles.listItem}>
            <View style={styles.listCopy}>
              <Text style={styles.itemName}>{template.name}</Text>
              <Text style={styles.helper}>
                {template.serves ? `Serves ${template.serves} · ` : ''}
                {template.items.map(({ menuEntry }) => menuEntry.name).join(', ')}
              </Text>
              {template.description ? <Text style={styles.helper}>{template.description}</Text> : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete ${template.name} template`}
              onPress={() => void deleteTemplate(template.id)}
              style={styles.deleteButton}
            >
              <Text style={styles.deleteText}>Remove</Text>
            </Pressable>
          </View>
        ))}
      </View>
      </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  commissionExample: {
    backgroundColor: '#F8EEDD',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  commissionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  commissionLabel: { color: '#3A2E22', fontSize: 14, flexShrink: 1 },
  commissionAmount: { color: '#185A43', fontSize: 16, fontWeight: '800' },
  commissionTotal: { borderTopWidth: 1, borderTopColor: '#D7C8AE', paddingTop: 12 },
  content: {
    paddingHorizontal: 18,
    paddingTop: 54,
    paddingBottom: 40,
    backgroundColor: '#F8EEDD',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  headerCopy: { flex: 1, paddingRight: 4 },
  menuButton: {
    minWidth: 54,
    minHeight: 48,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D7E3D9',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButtonIcon: { color: '#185A43', fontSize: 22, fontWeight: '800', lineHeight: 24 },
  menuButtonLabel: { color: '#185A43', fontSize: 10, fontWeight: '700', marginTop: 1 },
  workspaceMenu: {
    backgroundColor: '#fff',
    borderColor: '#E3D5BC',
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    gap: 4,
    marginBottom: 14,
  },
  menuHeading: {
    color: '#756C61',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    textTransform: 'uppercase',
  },
  menuItem: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  menuItemSelected: { backgroundColor: '#E8F0E9' },
  menuItemTitle: { color: '#185A43', fontSize: 14, fontWeight: '800' },
  menuItemDetail: { color: '#756C61', fontSize: 11, marginTop: 3 },
  menuSignOut: { backgroundColor: '#F8EEDD', marginTop: 4 },
  menuSignOutText: { color: '#B84F30', fontSize: 14, fontWeight: '800' },
  eyebrow: { color: '#B84F30', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: '#3A2E22', fontSize: 28, fontWeight: '800', marginTop: 5 },
  subtitle: { color: '#756C61', fontSize: 13, lineHeight: 19, marginTop: 6 },
  signOut: { paddingHorizontal: 11, paddingVertical: 8, backgroundColor: '#fff', borderRadius: 12 },
  signOutText: { color: '#185A43', fontSize: 12, fontWeight: '700' },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 14 },
  sectionTitle: { color: '#3A2E22', fontSize: 18, fontWeight: '800', marginBottom: 12 },
  input: {
    backgroundColor: '#FAF7F1',
    borderColor: '#E8DED0',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: '#3A2E22',
    fontSize: 13,
    marginBottom: 9,
  },
  multiline: { minHeight: 68, textAlignVertical: 'top' },
  fieldLabel: { color: '#3A2E22', fontSize: 12, fontWeight: '700', marginBottom: 8, marginTop: 3 },
  chipList: { flexGrow: 0, marginBottom: 9 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#E2D6C8',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginRight: 6,
    marginBottom: 6,
    backgroundColor: '#fff',
  },
  chipSelected: { backgroundColor: '#185A43', borderColor: '#185A43' },
  chipText: { color: '#3A2E22', fontSize: 11, fontWeight: '600' },
  chipTextSelected: { color: '#fff' },
  helper: { color: '#756C61', fontSize: 12, lineHeight: 18, marginBottom: 8 },
  allergenText: { color: '#B84F30', fontSize: 11, lineHeight: 17, marginTop: 4 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#185A43',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 5,
  },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#D7E3D9',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 8,
  },
  secondaryText: { color: '#185A43', fontWeight: '800', fontSize: 13 },
  commissionNotice: {
    color: '#654A20',
    backgroundColor: '#FFF4D8',
    borderColor: '#E9D49B',
    borderWidth: 1,
    borderRadius: 10,
    padding: 11,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  quoteSummary: {
    color: '#185A43',
    backgroundColor: '#E8F0E9',
    borderRadius: 10,
    padding: 10,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    marginBottom: 9,
  },
  disabled: { opacity: 0.55 },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F0EAE2',
    paddingVertical: 12,
  },
  listCopy: { flex: 1, paddingRight: 8 },
  itemName: { color: '#3A2E22', fontSize: 14, fontWeight: '800' },
  deleteButton: { paddingHorizontal: 9, paddingVertical: 7 },
  deleteText: { color: '#B84F30', fontSize: 11, fontWeight: '700' },
  templateChoice: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: '#185A43',
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },
  checkboxSelected: { backgroundColor: '#185A43' },
  checkMark: { color: '#fff', fontSize: 12, fontWeight: '800' },
  error: { color: '#A43F2B', backgroundColor: '#FBE9E4', borderRadius: 10, padding: 10, marginBottom: 12 },
  notice: { color: '#185A43', backgroundColor: '#E8F0E9', borderRadius: 10, padding: 10, marginBottom: 12 },
  mediaTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  mediaTypeChip: { borderColor: '#D9CCBD', borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9 },
  mediaTypeChipSelected: { backgroundColor: '#185A43', borderColor: '#185A43' },
  mediaTypeText: { color: '#3A2E22', fontSize: 12, fontWeight: '700' },
  mediaTypeTextSelected: { color: '#fff' },
});
