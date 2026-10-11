import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import {
  AfroChopLogo,
  AuthInput,
  AuthScreenLayout,
  FeaturedFoodRail,
  PasswordInput,
  PrimaryButton,
  RoleSelectionCard,
  WelcomeFoodImage,
} from './components/AuthUi';
import {
  RatingSummary,
  ReviewCard,
  type ChefReviewList,
  type ReviewSort,
} from './components/Reviews';
import { ChefWorkspace } from './components/ChefWorkspace';
import { FarmerAuth, FarmerWorkspace } from './components/FarmerWorkspace';
import { FarmersMarketplace } from './components/FarmersMarketplace';
import { authTokenStorage } from './lib/authTokenStorage';
import { avatarUrl } from './lib/avatar';
import { CalendarPicker, parseDateKey } from './components/CalendarPicker';
import { LocationDropdowns } from './components/LocationDropdowns';
import { FoodMediaItem } from './components/FoodMediaItem';
import { marketingContactRequiresOptIn } from './lib/marketingRegions';

const featuredCountryCodes = ['NG', 'GH', 'CM', 'MA', 'ET', 'SN', 'KE', 'ZA'];
const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';
const allergyNoticeVersion = '2026-10-08-v1';
const guideCompletionKey = '@afrochop/guide-completed-v1';

function getAuthErrorMessage(error: unknown, fallback: string) {
  if (
    error instanceof TypeError &&
    /failed to fetch|network request failed|fetch failed/i.test(error.message)
  ) {
    return 'Could not connect to AfroChop. Check your connection and try again.';
  }
  return error instanceof Error ? error.message : fallback;
}

const majorAllergens = [
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
const colors = {
  forest: '#185A43',
  spice: '#E69B45',
  cream: '#F8EEDD',
  terracotta: '#B84F30',
  brown: '#3A2E22',
  muted: '#756C61',
};

type Country = {
  id?: string;
  name: string;
  flag: string;
  code?: string;
};

type MarketCountry = {
  name: string;
  code: string;
};

type ChefSummary = {
  id: string;
  displayName: string;
  bio: string | null;
  city: string | null;
  state: string | null;
  specialties: string[];
  serviceTypes: string[];
  profileImageUrl: string | null;
  averageRating: number | null;
  reviewCount: number;
  serviceRadiusKm?: number | null;
  chefDishes: Array<{
    id: string;
    description?: string | null;
    knownIngredients: string[];
    majorAllergens: string[];
    crossContactRisks: string[];
    dish: {
      id: string;
      name: string;
      dishCountries?: Array<{ country: { id: string; name: string; flag: string } }>;
    };
  }>;
  menuEntries: Array<{
    id: string;
    name: string;
    description: string | null;
    knownIngredients: string[];
    majorAllergens: string[];
    crossContactRisks: string[];
    cuisineCountry: { id: string; name: string; flag: string } | null;
  }>;
  menuTemplates: Array<{
    id: string;
    name: string;
    description: string | null;
    serves: number | null;
    items: Array<{ menuEntry: { id: string; name: string } }>;
  }>;
  foodPhotos: Array<{ id: string; imageUrl: string; mediaType?: 'image' | 'video'; caption: string | null }>;
  serviceAreas?: Array<{ city: string | null; state: string | null }>;
  instagramUrl?: string | null;
  tiktokUrl?: string | null;
  youtubeUrl?: string | null;
  facebookUrl?: string | null;
};

function sortCuisineCountries(items: Country[]) {
  return items.slice().sort((left, right) => {
    const leftRank = featuredCountryCodes.indexOf(left.code ?? '');
    const rightRank = featuredCountryCodes.indexOf(right.code ?? '');
    return (leftRank === -1 ? featuredCountryCodes.length : leftRank) -
      (rightRank === -1 ? featuredCountryCodes.length : rightRank) ||
      left.name.localeCompare(right.name);
  });
}

function isValidPhone(value: string) {
  return /^\+[1-9]\d{7,14}$/.test(value.replace(/[\s()-]/g, ''));
}

async function openChefSocialProfile(platform: string, link: string) {
  const allowedHosts: Record<string, string[]> = {
    Instagram: ['instagram.com', 'www.instagram.com'],
    TikTok: ['tiktok.com', 'www.tiktok.com'],
    YouTube: ['youtube.com', 'www.youtube.com'],
    Facebook: ['facebook.com', 'www.facebook.com', 'fb.com', 'www.fb.com'],
  };
  const url = new URL(link);
  if (url.protocol !== 'https:' || !allowedHosts[platform]?.includes(url.hostname)) {
    throw new Error(`This ${platform} profile link is not valid.`);
  }
  await Linking.openURL(url.toString());
}

export default function App() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [marketCountries, setMarketCountries] = useState<MarketCountry[]>([]);
  const [chefs, setChefs] = useState<ChefSummary[]>([]);
  const [searchText, setSearchText] = useState('');
  const [city, setCity] = useState('');
  const [stateRegion, setStateRegion] = useState('');
  const [homeCountryCode, setHomeCountryCode] = useState('US');
  const [selectedCountryId, setSelectedCountryId] = useState<string>();
  const [selectedChef, setSelectedChef] = useState<ChefSummary | null>(null);
  const [chefReviews, setChefReviews] = useState<ChefReviewList | null>(null);
  const [reviewSort, setReviewSort] = useState<ReviewSort>('newest');
  const [bookingOpen, setBookingOpen] = useState(false);
  const [allergyAcknowledged, setAllergyAcknowledged] = useState(false);
  const [allergySelections, setAllergySelections] = useState<string[]>([]);
  const [dietaryNotes, setDietaryNotes] = useState('');
  const [bookingNotice, setBookingNotice] = useState<string | null>(null);
  const [quoteDate, setQuoteDate] = useState('');
  const [quoteDuration, setQuoteDuration] = useState('120');
  const [quoteServiceType, setQuoteServiceType] = useState('prepared_meals');
  const [quoteJurisdiction, setQuoteJurisdiction] = useState('MD');
  const [quoteNotes, setQuoteNotes] = useState('');
  const [isSubmittingQuote, setIsSubmittingQuote] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [showChefSignup, setShowChefSignup] = useState(false);
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [chefName, setChefName] = useState('');
  const [chefCity, setChefCity] = useState('');
  const [chefState, setChefState] = useState('');
  const [chefCountryCode, setChefCountryCode] = useState('US');
  const [chefCuisine, setChefCuisine] = useState('Nigeria');
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [signupMessage, setSignupMessage] = useState<string | null>(null);
  const [signupLocked, setSignupLocked] = useState(false);
  const [chefSessionToken, setChefSessionToken] = useState<string | null>(null);
  const [farmerSessionToken, setFarmerSessionToken] = useState<string | null>(null);
  const [showFarmerAuth, setShowFarmerAuth] = useState(false);
  const [showFarmers, setShowFarmers] = useState(false);
  const [isExistingCook, setIsExistingCook] = useState(false);
  const [showCustomerAuth, setShowCustomerAuth] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPassword, setCustomerPassword] = useState('');
  const [isExistingCustomer, setIsExistingCustomer] = useState(true);
  const [isAuthenticatingCustomer, setIsAuthenticatingCustomer] = useState(false);
  const [customerAuthMessage, setCustomerAuthMessage] = useState<string | null>(null);
  const [customerSessionToken, setCustomerSessionToken] = useState<string | null>(null);
  const [customerDisplayName, setCustomerDisplayName] = useState<string | null>(null);
  const [entryStage, setEntryStage] = useState<'welcome' | 'role'>('welcome');
  const [authIntent, setAuthIntent] = useState<'signin' | 'signup'>('signin');
  const [customerPhone, setCustomerPhone] = useState('');
  const [chefPhone, setChefPhone] = useState('');
  const [customerConfirmPassword, setCustomerConfirmPassword] = useState('');
  const [chefConfirmPassword, setChefConfirmPassword] = useState('');
  const [customerTermsAccepted, setCustomerTermsAccepted] = useState(false);
  const [customerSmsOptIn, setCustomerSmsOptIn] = useState(false);
  const [smsPreferenceTouched, setSmsPreferenceTouched] = useState(false);
  const [customerMarketingSharing, setCustomerMarketingSharing] = useState(false);
  const [customerMarketingSharingTouched, setCustomerMarketingSharingTouched] = useState(false);
  const [chefMarketingSharing, setChefMarketingSharing] = useState(true);
  const [chefMarketingSharingTouched, setChefMarketingSharingTouched] = useState(false);
  const [chefTermsAccepted, setChefTermsAccepted] = useState(false);
  const [chefBio, setChefBio] = useState('');
  const [chefProfileImageUrl, setChefProfileImageUrl] = useState('');
  const [chefServiceTypes, setChefServiceTypes] = useState<string[]>(['prepared_meals']);
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [customerOnboarding, setCustomerOnboarding] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [favoriteCountries, setFavoriteCountries] = useState<string[]>([]);
  const [favoriteDishes, setFavoriteDishes] = useState<string[]>([]);
  const [onboardingCity, setOnboardingCity] = useState('');
  const [onboardingState, setOnboardingState] = useState('');
  const [onboardingCountryCode, setOnboardingCountryCode] = useState('');
  const [onboardingCountryName, setOnboardingCountryName] = useState('');
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [isSavingOnboarding, setIsSavingOnboarding] = useState(false);
  const [guideRole, setGuideRole] = useState<'customer' | 'chef' | null>(null);
  const [guideStep, setGuideStep] = useState(0);
  const [guideError, setGuideError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void authTokenStorage.get()
      .then((storedSession) => {
        if (!active || !storedSession) return;
        const session = JSON.parse(storedSession) as {
          token?: unknown;
          role?: unknown;
          name?: unknown;
        };
        if (typeof session.token !== 'string' ||
            (session.role !== 'chef' && session.role !== 'customer' && session.role !== 'farmer')) {
          throw new Error('Saved sign-in details are invalid. Please sign in again.');
        }
        if (session.role === 'chef') setChefSessionToken(session.token);
        else if (session.role === 'farmer') setFarmerSessionToken(session.token);
        else {
          setCustomerSessionToken(session.token);
          setCustomerDisplayName(typeof session.name === 'string' ? session.name : null);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setCustomerAuthMessage(error instanceof Error
            ? error.message
            : 'Could not restore your sign-in. Please sign in again.');
        }
      })
      .finally(() => {
        if (active) setIsRestoringSession(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function showGuideForFirstTime(role: 'customer' | 'chef') {
    setGuideError(null);
    setGuideStep(0);
    try {
      const hasCompletedGuide = await AsyncStorage.getItem(guideCompletionKey);
      setGuideRole(hasCompletedGuide ? null : role);
      if (hasCompletedGuide && role === 'customer' && isNewCustomer) {
        setCustomerOnboarding(true);
      }
    } catch (error) {
      setGuideRole(role);
      setGuideError(
        error instanceof Error
          ? `Could not check your guide preference: ${error.message}`
          : 'Could not check your guide preference.',
      );
    }
  }

  async function finishGuide() {
    setGuideError(null);
    try {
      await AsyncStorage.setItem(guideCompletionKey, 'true');
      setGuideRole(null);
      if (guideRole === 'customer' && isNewCustomer) setCustomerOnboarding(true);
    } catch (error) {
      setGuideError(
        error instanceof Error
          ? `Could not save your guide preference: ${error.message}`
          : 'Could not save your guide preference.',
      );
    }
  }

  function resetCustomerHome() {
    setSelectedChef(null);
    setChefReviews(null);
    setBookingOpen(false);
    setBookingNotice(null);
    setAllergyAcknowledged(false);
    setAllergySelections([]);
    setDietaryNotes('');
    setQuoteNotes('');
    setSearchText('');
    setCity('');
    setStateRegion('');
    setSelectedCountryId(undefined);
    setCustomerOnboarding(false);
    void loadChefs('', null, '', '');
  }

  async function signOutCustomer() {
    try {
      await authTokenStorage.remove();
    } catch (error) {
      setDiscoveryError(error instanceof Error ? error.message : 'Could not clear saved sign-in.');
      return;
    }

    setCustomerSessionToken(null);
    setCustomerDisplayName(null);
    setShowFarmers(false);
    setShowCustomerAuth(false);
    setCustomerOnboarding(false);
    setGuideRole(null);
    setAuthIntent('signin');
    setEntryStage('role');
    setBookingOpen(false);
    setBookingNotice(null);
    setSelectedChef(null);
    setChefReviews(null);
    setDiscoveryError(null);
    setCustomerAuthMessage(null);
  }

  async function loadChefs(
    search = searchText,
    countryId: string | null = selectedCountryId ?? null,
    serviceCity = city,
    serviceState = stateRegion,
  ) {
    setIsLoading(true);
    setDiscoveryError(null);
    const params = new URLSearchParams();
    if (search?.trim()) params.set('q', search.trim());
    if (countryId) params.set('countryId', countryId);
    if (serviceCity.trim()) params.set('city', serviceCity.trim());
    if (serviceState.trim()) params.set('state', serviceState.trim());

    try {
      const response = await fetch(`${apiBaseUrl}/chefs?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Chef search failed (${response.status}).`);
      }
      const data: { items: ChefSummary[] } = await response.json();
      setChefs(data.items);
    } catch (error) {
      setDiscoveryError(error instanceof Error ? error.message : 'Could not load chefs.');
      setChefs([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function registerChef() {
    setSignupMessage(null);
    if (!signupEmail.trim() || signupPassword.length < 8 ||
        (!isExistingCook && signupPassword !== chefConfirmPassword) ||
        (!isExistingCook && (!signupName.trim() || !chefName.trim() || !chefCity.trim() ||
        !marketCountries.some(({ code }) => code === chefCountryCode.trim().toUpperCase()) ||
        !chefCuisine.trim() || chefServiceTypes.length === 0 ||
          (chefPhone.trim() !== '' && !isValidPhone(chefPhone)) ||
          !chefTermsAccepted))) {
      setSignupMessage(isExistingCook
        ? 'Enter your email and a password of at least 8 characters.'
        : 'Complete each required field, choose a supported country, confirm your password, and accept the Terms and Privacy Policy. If you add a phone number, include the country code (+...).');
      return;
    }

    setIsSigningUp(true);
    let accountCreated = false;
    try {
      const registrationResponse = await fetch(`${apiBaseUrl}/auth/${isExistingCook ? 'login' : 'register'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isExistingCook
          ? { email: signupEmail.trim(), password: signupPassword }
          : {
              name: signupName.trim(),
              email: signupEmail.trim(),
              password: signupPassword,
              role: 'chef',
            }),
      });
      const registration = await registrationResponse.json();
      if (!registrationResponse.ok) {
        const message = Array.isArray(registration.message)
          ? registration.message.join(' ')
          : registration.message;
        throw new Error(message ?? `Registration failed (${registrationResponse.status}).`);
      }
      accountCreated = true;

      if (isExistingCook) {
        if (registration.role !== 'chef') throw new Error('This account is not registered as a chef.');
        await authTokenStorage.set(JSON.stringify({
          token: registration.token,
          role: 'chef',
          name: registration.name,
        }));
        await showGuideForFirstTime('chef');
        setChefSessionToken(registration.token);
        setShowChefSignup(false);
        setSignupMessage(null);
        return;
      }

      if (chefPhone.trim()) {
        const phoneResponse = await fetch(`${apiBaseUrl}/verification/me/phone`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${registration.token}`,
          },
          body: JSON.stringify({ phoneNumber: chefPhone.replace(/[\s()-]/g, '') }),
        });
        if (!phoneResponse.ok) {
          const result = await phoneResponse.json();
          const message = Array.isArray(result.message) ? result.message.join(' ') : result.message;
          throw new Error(message ?? `Phone number could not be saved (${phoneResponse.status}).`);
        }

      }
      const profileResponse = await fetch(`${apiBaseUrl}/chefs/me/profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${registration.token}`,
        },
        body: JSON.stringify({
          displayName: chefName.trim(),
          city: chefCity.trim(),
          state: chefState.trim() || undefined,
          countryCode: chefCountryCode.trim().toUpperCase(),
          specialties: [chefCuisine.trim()],
          bio: chefBio.trim() || undefined,
          serviceTypes: chefServiceTypes,
          profileImageUrl: chefProfileImageUrl.trim() || undefined,
          serviceRadiusKm: 25,
        }),
      });
      const profileResult = await profileResponse.json();
      if (!profileResponse.ok) {
        const message = Array.isArray(profileResult.message)
          ? profileResult.message.join(' ')
          : profileResult.message;
        throw new Error(message ?? `Chef profile setup failed (${profileResponse.status}).`);
      }

      const serviceAreaResponse = await fetch(`${apiBaseUrl}/chefs/me/service-areas`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${registration.token}`,
        },
        body: JSON.stringify({
          areas: [{
            city: chefCity.trim(),
            state: chefState.trim() || undefined,
            countryCode: chefCountryCode.trim().toUpperCase(),
            radiusKm: 25,
            offersDelivery: false,
            offersPickup: true,
          }],
        }),
      });
      const serviceAreaResult = await serviceAreaResponse.json();
      if (!serviceAreaResponse.ok) {
        const message = Array.isArray(serviceAreaResult.message)
          ? serviceAreaResult.message.join(' ')
          : serviceAreaResult.message;
        throw new Error(message ?? `Service area setup failed (${serviceAreaResponse.status}).`);
      }

      let contactSyncNotice: string | null = null;
      try {
        const contactResponse = await fetch(`${apiBaseUrl}/auth/me/marketing-contact-preference`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${registration.token}`,
          },
          body: JSON.stringify({
            countryCode: chefCountryCode.trim().toUpperCase(),
            enabled: chefMarketingSharing,
            explicitConsent: chefMarketingSharingTouched,
          }),
        });
        const contactResult = await contactResponse.json();
        if (!contactResponse.ok) {
          const message = Array.isArray(contactResult.message)
            ? contactResult.message.join(' ')
            : contactResult.message;
          contactSyncNotice = message ?? `Contact preference could not be saved (${contactResponse.status}).`;
        } else if (contactResult.exportStatus === 'not_configured') {
          contactSyncNotice = 'Contact-list syncing is not configured yet; your preference was saved.';
        }
      } catch (contactError) {
        contactSyncNotice = contactError instanceof Error
          ? `Your cook profile is ready, but the contact preference could not be saved: ${contactError.message}`
          : 'Your cook profile is ready, but the contact preference could not be saved.';
      }

      setSignupMessage(
        `Your chef account and profile are submitted. AfroChop reviews chef profiles before they appear in customer search.${
          contactSyncNotice ? ` ${contactSyncNotice}` : ''
        }`,
      );
      setSignupLocked(true);
      await authTokenStorage.set(JSON.stringify({
        token: registration.token,
        role: 'chef',
        name: registration.name,
      }));
      await showGuideForFirstTime('chef');
      setChefSessionToken(registration.token);
      setShowChefSignup(false);
    } catch (error) {
      const message = getAuthErrorMessage(error, 'Could not complete chef registration.');
      setSignupMessage(accountCreated
        ? `Your account was created, but chef profile setup did not finish: ${message} Please contact support before registering again.`
        : message);
      if (accountCreated) setSignupLocked(true);
    } finally {
      setIsSigningUp(false);
    }
  }

  async function authenticateCustomer() {
    setCustomerAuthMessage(null);
    if (!customerEmail.trim() || customerPassword.length < 8 ||
        (!isExistingCustomer && (
          !customerName.trim() ||
          (customerPhone.trim() !== '' && !isValidPhone(customerPhone)) ||
          (customerSmsOptIn && !customerPhone.trim()) ||
          customerPassword !== customerConfirmPassword ||
          !customerTermsAccepted
        ))) {
      setCustomerAuthMessage(isExistingCustomer
        ? 'Enter your email and a password of at least 8 characters.'
        : 'Complete each required field, confirm your password, and accept the Terms and Privacy Policy. A phone number is optional unless you opt in to text updates; include the country code (+...).');
      return;
    }

    setIsAuthenticatingCustomer(true);
    try {
      const response = await fetch(
        `${apiBaseUrl}/auth/${isExistingCustomer ? 'login' : 'register'}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(isExistingCustomer
            ? { email: customerEmail.trim(), password: customerPassword }
            : {
                name: customerName.trim(),
                email: customerEmail.trim(),
                password: customerPassword,
                role: 'customer',
                smsOrderUpdates: customerSmsOptIn,
              }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        const message = Array.isArray(result.message) ? result.message.join(' ') : result.message;
        throw new Error(message ?? `Sign in failed (${response.status}).`);
      }
      if (result.role !== 'customer') {
        throw new Error('This account is not registered as a customer. Use the cook sign-in for chef accounts.');
      }
      const initialMarketingCountryCode =
        typeof result.marketingCountryCode === 'string' ? result.marketingCountryCode : '';
      setOnboardingCountryCode(initialMarketingCountryCode);
      setOnboardingCountryName(
        marketCountries.find(({ code }) => code === initialMarketingCountryCode)?.name ?? '',
      );
      setCustomerMarketingSharing(Boolean(result.marketingContactSharing));
      setCustomerMarketingSharingTouched(false);

      if (!isExistingCustomer && customerPhone.trim()) {
        const phoneResponse = await fetch(`${apiBaseUrl}/verification/me/phone`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${result.token}`,
          },
          body: JSON.stringify({ phoneNumber: customerPhone.replace(/[\s()-]/g, '') }),
        });
        if (!phoneResponse.ok) {
          const phoneResult = await phoneResponse.json();
          const message = Array.isArray(phoneResult.message)
            ? phoneResult.message.join(' ')
            : phoneResult.message;
          throw new Error(message ?? `Phone number could not be saved (${phoneResponse.status}).`);
        }
      } else if (isExistingCustomer && smsPreferenceTouched) {
        if (customerSmsOptIn && customerPhone.trim()) {
          const phoneResponse = await fetch(`${apiBaseUrl}/verification/me/phone`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${result.token}`,
            },
            body: JSON.stringify({ phoneNumber: customerPhone.replace(/[\s()-]/g, '') }),
          });
          if (!phoneResponse.ok) {
            const phoneResult = await phoneResponse.json();
            const message = Array.isArray(phoneResult.message)
              ? phoneResult.message.join(' ')
              : phoneResult.message;
            throw new Error(message ?? `Phone number could not be saved (${phoneResponse.status}).`);
          }
        }
        const preferenceResponse = await fetch(`${apiBaseUrl}/auth/me/notification-preferences`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${result.token}`,
          },
          body: JSON.stringify({ smsOrderUpdates: customerSmsOptIn }),
        });
        if (!preferenceResponse.ok) {
          const preferenceResult = await preferenceResponse.json();
          const message = Array.isArray(preferenceResult.message)
            ? preferenceResult.message.join(' ')
            : preferenceResult.message;
          throw new Error(message ?? `Text preference could not be saved (${preferenceResponse.status}).`);
        }
      }

      await authTokenStorage.set(JSON.stringify({
        token: result.token,
        role: 'customer',
        name: result.name,
      }));
      setIsNewCustomer(!isExistingCustomer || !initialMarketingCountryCode);
      await showGuideForFirstTime('customer');
      setCustomerSessionToken(result.token);
      setCustomerDisplayName(result.name);
      setCustomerSmsOptIn(Boolean(result.smsOrderUpdates));
      setSmsPreferenceTouched(false);
      setCustomerPassword('');
      setCustomerConfirmPassword('');
      setShowCustomerAuth(false);
      setCustomerAuthMessage(null);
      setBookingNotice(null);
    } catch (error) {
      setCustomerAuthMessage(getAuthErrorMessage(error, 'Could not sign in.'));
    } finally {
      setIsAuthenticatingCustomer(false);
    }
  }

  async function submitQuoteRequest() {
    setBookingNotice(null);
    if (!customerSessionToken) {
      setBookingNotice('Sign in or create a customer account before sending a quote request.');
      return;
    }
    if (!selectedChef) {
      setBookingNotice('Choose a chef before requesting a quote.');
      return;
    }
    if (!allergyAcknowledged) {
      setBookingNotice('Please review and acknowledge the food allergy notice before sending your request.');
      return;
    }
    if (!quoteDate) {
      setBookingNotice('Please choose the date of service from the calendar.');
      return;
    }
    const requestedDate = parseDateKey(quoteDate);
    const durationMinutes = Number(quoteDuration);
    if (!Number.isFinite(requestedDate.getTime()) || requestedDate <= new Date()) {
      setBookingNotice('Choose a service date in the future.');
      return;
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes < 30 || durationMinutes > 720) {
      setBookingNotice('Service duration must be between 30 minutes and 12 hours.');
      return;
    }
    if (!quoteJurisdiction.trim()) {
      setBookingNotice('Enter the two-letter state or jurisdiction code for the service.');
      return;
    }

    setIsSubmittingQuote(true);
    try {
      const response = await fetch(`${apiBaseUrl}/quotes/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerSessionToken}`,
        },
        body: JSON.stringify({
          chefId: selectedChef.id,
          serviceType: quoteServiceType,
          requestedDate: requestedDate.toISOString(),
          jurisdictionCode: quoteJurisdiction.trim().toUpperCase(),
          durationMinutes,
          notes: quoteNotes.trim() || undefined,
          disclosedAllergens: allergySelections,
          dietaryRestrictions: dietaryNotes.trim() ? [dietaryNotes.trim()] : [],
          allergyNoticeAcknowledged: true,
          allergyNoticeVersion,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        const message = Array.isArray(result.message) ? result.message.join(' ') : result.message;
        throw new Error(message ?? `Quote request failed (${response.status}).`);
      }
      setBookingNotice(
        allergySelections.length || dietaryNotes.trim()
          ? 'Your quote request and allergy/dietary details were sent to the cook for review.'
          : 'Your quote request was sent to the cook.',
      );
      setAllergyAcknowledged(false);
      setAllergySelections([]);
      setDietaryNotes('');
      setQuoteNotes('');
    } catch (error) {
      setBookingNotice(error instanceof Error ? error.message : 'Could not send your quote request.');
    } finally {
      setIsSubmittingQuote(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    fetch(`${apiBaseUrl}/catalog/countries`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Country list failed (${response.status}).`);
        const data: Country[] = await response.json();
        if (isMounted) setCountries(data);
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setDiscoveryError(error instanceof Error ? error.message : 'Could not load countries.');
        }
      });

    fetch(`${apiBaseUrl}/catalog/market-countries`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Location country list failed (${response.status}).`);
        const data: MarketCountry[] = await response.json();
        if (isMounted) setMarketCountries(data);
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setDiscoveryError(error instanceof Error ? error.message : 'Could not load location countries.');
        }
      });

    void loadChefs();
    return () => {
      isMounted = false;
    };
  }, []);

  async function openChefProfile(chefId: string) {
    setDiscoveryError(null);
    try {
      const [profileResponse, reviewsResponse] = await Promise.all([
        fetch(`${apiBaseUrl}/chefs/${chefId}`),
        fetch(`${apiBaseUrl}/chefs/${chefId}/reviews?sort=newest`),
      ]);
      if (!profileResponse.ok) throw new Error(`Chef profile failed (${profileResponse.status}).`);
      if (!reviewsResponse.ok) throw new Error(`Chef reviews failed (${reviewsResponse.status}).`);
      const profile: ChefSummary = await profileResponse.json();
      const reviews: ChefReviewList = await reviewsResponse.json();
      setSelectedChef(profile);
      setChefReviews(reviews);
      setReviewSort('newest');
    } catch (error) {
      setDiscoveryError(error instanceof Error ? error.message : 'Could not load chef profile.');
    }
  }

  async function loadChefReviews(chefId: string, sort: ReviewSort) {
    setDiscoveryError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/chefs/${chefId}/reviews?sort=${sort}`);
      if (!response.ok) throw new Error(`Chef reviews failed (${response.status}).`);
      const reviews: ChefReviewList = await response.json();
      setChefReviews(reviews);
      setReviewSort(sort);
    } catch (error) {
      setDiscoveryError(error instanceof Error ? error.message : 'Could not load reviews.');
    }
  }

  return (
    <SafeAreaProvider>
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <StatusBar style="dark" />
      {isRestoringSession ? (
        <View style={styles.authLoading}>
          <ActivityIndicator color={colors.forest} size="large" />
          <Text style={styles.signupIntro}>Checking your secure sign-in…</Text>
        </View>
      ) : guideRole ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="on-drag">
          <View style={styles.guideScreen}>
            <View style={styles.brandRow}>
              <Text style={styles.brandMark}>🍲</Text>
              <Text style={styles.eyebrow}>AfroChop guide</Text>
            </View>
            <Text style={styles.title}>
              {guideRole === 'customer' ? 'Find your next favorite.' : 'Build your cooking business.'}
            </Text>
            <Text style={styles.signupIntro}>
              {guideRole === 'customer'
                ? 'Here are a few quick tips to get started as a customer.'
                : 'Here are a few quick tips to get started as a cook.'}
            </Text>
            {guideRole === 'customer' && customerSessionToken ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sign out of your customer account"
                onPress={() => void signOutCustomer()}
                style={styles.guideSkip}
              >
                <Text style={styles.linkText}>Sign out</Text>
              </Pressable>
            ) : null}
            {discoveryError ? <Text accessibilityRole="alert" style={styles.stateError}>{discoveryError}</Text> : null}
            {(guideRole === 'customer'
              ? [
                  { title: 'Discover local cooks', body: 'Search by location, cuisine, or name. Open a profile to explore dishes, photos, reviews, and service areas.' },
                  { title: 'Find the right menu', body: 'Review ingredients and allergen details, then contact a cook with a quote request for your occasion.' },
                  { title: 'Share important food needs', body: 'Include allergies and dietary restrictions with your request. The cook will review them before confirming.' },
                ]
              : [
                  { title: 'Create your menu', body: 'Add dishes, ingredients, cuisine details, and food photos so customers can discover what you make.' },
                  { title: 'Respond to customers', body: 'Customers can request a quote. Review their order details and dietary notes before agreeing.' },
                  { title: 'Prepare your workspace', body: 'Keep your profile current and complete payout setup when you are ready to receive transfers.' },
                ]
            ).map((step, index) => index === guideStep ? (
              <View key={step.title} style={styles.guideCard}>
                <Text style={styles.guideStepLabel}>STEP {index + 1} OF 3</Text>
                <Text style={styles.guideStepTitle}>{step.title}</Text>
                <Text style={styles.guideStepBody}>{step.body}</Text>
              </View>
            ) : null)}
            <View style={styles.guideProgress}>
              {[0, 1, 2].map((step) => (
                <View
                  key={step}
                  style={[styles.guideDot, step === guideStep && styles.guideDotActive]}
                />
              ))}
            </View>
            {guideError ? <Text accessibilityRole="alert" style={styles.signupMessage}>{guideError}</Text> : null}
            {guideError ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setGuideRole(null);
                  if (guideRole === 'customer' && isNewCustomer) setCustomerOnboarding(true);
                }}
                style={styles.guideSkip}
              >
                <Text style={styles.linkText}>Continue without saving</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (guideStep < 2) setGuideStep((current) => current + 1);
                else void finishGuide();
              }}
              style={[styles.primaryButton, styles.signupButton]}
            >
              <Text style={styles.primaryButtonText}>{guideStep < 2 ? 'Next' : 'Get started'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => void finishGuide()} style={styles.guideSkip}>
              <Text style={styles.linkText}>Skip guide</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : customerOnboarding ? (
        <AuthScreenLayout>
          <View style={styles.signupScreen}>
            <AfroChopLogo />
            <Text style={[styles.eyebrow, styles.authEyebrow]}>YOUR TABLE, YOUR WAY</Text>
            <Text style={styles.title}>Welcome{customerDisplayName ? `, ${customerDisplayName.split(' ')[0]}` : ''}!</Text>
            <Text style={styles.signupIntro}>
              Add a city to find nearby cooks, or skip it and browse anywhere. Location access is optional.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign out of your customer account"
              onPress={() => void signOutCustomer()}
              style={styles.guideSkip}
            >
              <Text style={styles.linkText}>Sign out</Text>
            </Pressable>
            {discoveryError ? <Text accessibilityRole="alert" style={styles.stateError}>{discoveryError}</Text> : null}
            <Text style={styles.formSectionTitle}>Where should we look?</Text>
            <LocationDropdowns
              countries={marketCountries}
              apiBaseUrl={apiBaseUrl}
              countryCode={onboardingCountryCode}
              countryName={onboardingCountryName}
              state={onboardingState}
              city={onboardingCity}
              onCountryChange={(code, name) => {
                setOnboardingCountryCode(code);
                setOnboardingCountryName(name);
                setOnboardingState('');
                setOnboardingCity('');
                setCustomerMarketingSharing(!marketingContactRequiresOptIn(code));
                setCustomerMarketingSharingTouched(false);
              }}
              onStateChange={setOnboardingState}
              onCityChange={setOnboardingCity}
            />
            {onboardingCountryCode ? (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: customerMarketingSharing }}
                onPress={() => {
                  setCustomerMarketingSharing((value) => !value);
                  setCustomerMarketingSharingTouched(true);
                }}
                style={styles.consentRow}
              >
                <View style={[
                  styles.checkbox,
                  customerMarketingSharing && styles.checkboxChecked,
                ]}>
                  {customerMarketingSharing ? <Text style={styles.checkboxTick}>✓</Text> : null}
                </View>
                <Text style={styles.consentText}>
                  {marketingContactRequiresOptIn(onboardingCountryCode)
                    ? 'Optional: I agree to share my name, email, and phone with AfroChop’s Google Sheets contact list for promotional updates.'
                    : 'AfroChop will store my name, email, and phone in its Google Sheets contact list for promotional updates. Uncheck to opt out.'}
                </Text>
              </Pressable>
            ) : null}
            <Text style={styles.formSectionTitle}>Favorite cuisines</Text>
            <View style={styles.onboardingChoices}>
              {sortCuisineCountries(countries).map((country) => {
                const key = country.id ?? country.code ?? country.name;
                const selected = favoriteCountries.includes(key);
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    onPress={() => setFavoriteCountries((current) =>
                      selected ? current.filter((item) => item !== key) : [...current, key],
                    )}
                    style={[styles.onboardingChip, selected && styles.onboardingChipSelected]}
                  >
                    <Text style={[styles.onboardingChipText, selected && styles.onboardingChipTextSelected]}>
                      {country.flag} {country.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.formSectionTitle}>What are you craving?</Text>
            <View style={styles.onboardingChoices}>
              {['Jollof rice', 'Ndolé', 'Egusi soup', 'Fufu', 'Suya', 'Injera'].map((dish) => {
                const selected = favoriteDishes.includes(dish);
                return (
                  <Pressable
                    key={dish}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    onPress={() => setFavoriteDishes((current) =>
                      selected ? current.filter((item) => item !== dish) : [...current, dish],
                    )}
                    style={[styles.onboardingChip, selected && styles.onboardingChipSelected]}
                  >
                    <Text style={[styles.onboardingChipText, selected && styles.onboardingChipTextSelected]}>
                      {dish}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {onboardingError ? <Text accessibilityRole="alert" style={styles.signupMessage}>{onboardingError}</Text> : null}
            <PrimaryButton
              label="Explore African Food"
              loading={isSavingOnboarding}
              onPress={() => {
                setIsSavingOnboarding(true);
                setOnboardingError(null);
                void (async () => {
                  let contactSyncNotice: string | null = null;
                  if (onboardingCountryCode) {
                    const response = await fetch(`${apiBaseUrl}/auth/me/marketing-contact-preference`, {
                      method: 'PATCH',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${customerSessionToken}`,
                      },
                      body: JSON.stringify({
                        countryCode: onboardingCountryCode,
                        enabled: customerMarketingSharing,
                        explicitConsent: customerMarketingSharingTouched,
                      }),
                    });
                    const result = await response.json();
                    if (!response.ok) {
                      const message = Array.isArray(result.message) ? result.message.join(' ') : result.message;
                      throw new Error(message ?? `Contact preference could not be saved (${response.status}).`);
                    }
                    if (result.exportStatus === 'not_configured') {
                      contactSyncNotice = 'Your preference was saved. Contact-list syncing is not configured yet.';
                    }
                  }
                  await AsyncStorage.setItem('afrochop.customer-preferences', JSON.stringify({
                  city: onboardingCity.trim(),
                  state: onboardingState.trim(),
                  countryCode: onboardingCountryCode,
                  favoriteCountries,
                  favoriteDishes,
                  }));
                  setCity(onboardingCity.trim());
                  setStateRegion(onboardingState.trim());
                  if (onboardingCountryCode) {
                    const selectedCountry = countries.find(({ code }) => code === onboardingCountryCode);
                    if (selectedCountry?.id) setSelectedCountryId(selectedCountry.id);
                  }
                  setCustomerOnboarding(false);
                  if (contactSyncNotice) setBookingNotice(contactSyncNotice);
                  void loadChefs(
                    searchText,
                    countries.find(({ code }) => code === onboardingCountryCode)?.id ?? null,
                    onboardingCity.trim(),
                    onboardingState.trim(),
                  );
                })()
                  .catch((error: unknown) => setOnboardingError(
                    error instanceof Error ? error.message : 'Could not save your preferences.',
                  ))
                  .finally(() => setIsSavingOnboarding(false));
              }}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setOnboardingCity('');
                setOnboardingState('');
                setCustomerOnboarding(false);
                void loadChefs(searchText, selectedCountryId ?? null, '', stateRegion);
              }}
              style={styles.guideSkip}
            >
              <Text style={styles.linkText}>Skip for now</Text>
            </Pressable>
          </View>
        </AuthScreenLayout>
      ) : farmerSessionToken ? (
        <FarmerWorkspace
          token={farmerSessionToken}
          apiBaseUrl={apiBaseUrl}
          onSignOut={() => {
            setFarmerSessionToken(null);
            setShowFarmerAuth(false);
            setEntryStage('welcome');
            void authTokenStorage.remove().catch(() => undefined);
          }}
        />
      ) : showFarmerAuth ? (
        <FarmerAuth
          apiBaseUrl={apiBaseUrl}
          countries={marketCountries}
          isSignIn={authIntent === 'signin'}
          onBack={() => setShowFarmerAuth(false)}
          onAuthenticated={(token, name) => {
            void authTokenStorage.set(JSON.stringify({ token, role: 'farmer', name })).catch(() => undefined);
            setFarmerSessionToken(token);
            setShowFarmerAuth(false);
          }}
        />
      ) : customerSessionToken && showFarmers ? (
        <FarmersMarketplace
          token={customerSessionToken}
          apiBaseUrl={apiBaseUrl}
          countries={marketCountries}
          onBack={() => setShowFarmers(false)}
          onSignOut={() => void signOutCustomer()}
        />
      ) : chefSessionToken ? (
        <ChefWorkspace
          token={chefSessionToken}
          countries={countries.filter((country): country is Country & { id: string } => Boolean(country.id))}
          apiBaseUrl={apiBaseUrl}
          onSignOut={() => {
            setChefSessionToken(null);
            setShowChefSignup(false);
            setEntryStage('welcome');
            void authTokenStorage.remove().catch((error: unknown) => {
              setDiscoveryError(error instanceof Error ? error.message : 'Could not clear saved sign-in.');
            });
          }}
        />
      ) : (
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="on-drag">
        {showCustomerAuth ? (
          <View style={styles.signupScreen}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setShowCustomerAuth(false);
                setCustomerAuthMessage(null);
                setEntryStage('role');
              }}
              style={styles.backButton}
            >
              <Text style={styles.linkText}>‹ Back</Text>
            </Pressable>
            <AfroChopLogo />
            <Text style={styles.eyebrow}>{isExistingCustomer ? 'Welcome back' : 'Join AfroChop'}</Text>
            <Text style={styles.title}>
              {isExistingCustomer ? 'Welcome Back!' : 'Create your account'}
            </Text>
            <Text style={styles.signupIntro}>{isExistingCustomer
              ? 'Your next taste of home awaits.'
              : 'Find local cooks and bring your favorite food to the table.'}</Text>
            {!isExistingCustomer ? (
              <AuthInput
                label="Full name"
                placeholder="Your full name"
                value={customerName}
                onChangeText={setCustomerName}
              />
            ) : null}
            <AuthInput
              label="Email address"
              placeholder="you@example.com"
              value={customerEmail}
              onChangeText={setCustomerEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            {!isExistingCustomer ? (
              <AuthInput
                label="Phone number (optional, include +country code)"
                placeholder="+1 555 123 4567"
                value={customerPhone}
                onChangeText={setCustomerPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
                autoCapitalize="none"
              />
            ) : null}
            <PasswordInput
              label="Password"
              placeholder="At least 8 characters"
              value={customerPassword}
              onChangeText={setCustomerPassword}
            />
            {!isExistingCustomer ? (
              <PasswordInput
                label="Confirm password"
                placeholder="Re-enter your password"
                value={customerConfirmPassword}
                onChangeText={setCustomerConfirmPassword}
              />
            ) : null}
            {!isExistingCustomer ? (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: customerTermsAccepted }}
                onPress={() => setCustomerTermsAccepted((value) => !value)}
                style={styles.consentRow}
              >
                <View style={[styles.checkbox, customerTermsAccepted && styles.checkboxChecked]}>
                  {customerTermsAccepted ? <Text style={styles.checkboxTick}>✓</Text> : null}
                </View>
                <Text style={styles.consentText}>I agree to the Terms of Service and Privacy Policy.</Text>
              </Pressable>
            ) : null}
            {isExistingCustomer ? (
              <Text style={styles.formFootnote}>
                Leave your text-update preference unchanged, or choose to enable or turn off order texts below.
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: customerSmsOptIn }}
              onPress={() => {
                setCustomerSmsOptIn((value) => !value);
                if (isExistingCustomer) setSmsPreferenceTouched(true);
              }}
              style={styles.consentRow}
            >
              <View style={[styles.checkbox, customerSmsOptIn && styles.checkboxChecked]}>
                {customerSmsOptIn ? <Text style={styles.checkboxTick}>✓</Text> : null}
              </View>
              <Text style={styles.consentText}>
                {isExistingCustomer
                  ? 'Enable text updates for quotes and order status.'
                  : 'Text me quote and order status updates. Message and data rates may apply. Reply STOP to opt out.'}
              </Text>
            </Pressable>
            {isExistingCustomer && customerSmsOptIn ? (
              <AuthInput
                label="Mobile number (optional if already on your account)"
                placeholder="+1 555 123 4567"
                value={customerPhone}
                onChangeText={setCustomerPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
                autoCapitalize="none"
              />
            ) : null}
            {isExistingCustomer ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: smsPreferenceTouched && !customerSmsOptIn }}
                onPress={() => {
                  setCustomerSmsOptIn(false);
                  setSmsPreferenceTouched(true);
                }}
                style={styles.preferenceAction}
              >
                <Text style={styles.linkText}>
                  {smsPreferenceTouched && !customerSmsOptIn ? 'Text updates will be off' : 'Turn off text updates'}
                </Text>
              </Pressable>
            ) : null}
            <PrimaryButton
              label={isExistingCustomer ? 'Sign In' : 'Create Account'}
              loading={isAuthenticatingCustomer}
              onPress={() => void authenticateCustomer()}
            />
            {customerAuthMessage ? <Text accessibilityRole="alert" style={styles.signupMessage}>{customerAuthMessage}</Text> : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setIsExistingCustomer((current) => !current);
                setCustomerSmsOptIn(false);
                setSmsPreferenceTouched(false);
                setCustomerAuthMessage(null);
              }}
            >
              <Text style={styles.linkText}>
                {isExistingCustomer ? 'New to AfroChop? Create an account' : 'Already have an account? Sign in'}
              </Text>
            </Pressable>
            {!isExistingCustomer ? (
              <Text style={styles.formFootnote}>
                Email and phone are recorded as pending verification. Verification codes are not available yet.
              </Text>
            ) : null}
          </View>
        ) : showChefSignup ? (
          <View style={styles.signupScreen}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setShowChefSignup(false);
                setSignupMessage(null);
                setEntryStage('role');
              }}
              style={styles.backButton}
            >
              <Text style={styles.linkText}>‹ Back</Text>
            </Pressable>
            <AfroChopLogo />
            <Text style={styles.eyebrow}>{isExistingCook ? 'Welcome back' : 'Cook with AfroChop'}</Text>
            <Text style={styles.title}>{isExistingCook ? 'Welcome Back!' : 'Create your cook account'}</Text>
            <Text style={styles.signupIntro}>
              {isExistingCook
                ? 'Your cooking workspace is ready when you are.'
                : 'Create your cook account and starter profile. Profiles go through AfroChop review before customers can find them.'}
            </Text>
            {!isExistingCook ? (
              <AuthInput
                label="Full name"
                placeholder="Your full name"
                value={signupName}
                onChangeText={setSignupName}
              />
            ) : null}
            <AuthInput
              label="Email address"
              placeholder="you@example.com"
              value={signupEmail}
              onChangeText={setSignupEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            {!isExistingCook ? (
              <AuthInput
                label="Phone number (optional, include +country code)"
                placeholder="+1 555 123 4567"
                value={chefPhone}
                onChangeText={setChefPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
                autoCapitalize="none"
              />
            ) : null}
            <PasswordInput
              label="Password"
              placeholder="At least 8 characters"
              value={signupPassword}
              onChangeText={setSignupPassword}
            />
            {!isExistingCook ? (
              <PasswordInput
                label="Confirm password"
                placeholder="Re-enter your password"
                value={chefConfirmPassword}
                onChangeText={setChefConfirmPassword}
              />
            ) : null}
            {!isExistingCook ? (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: chefTermsAccepted }}
                onPress={() => setChefTermsAccepted((value) => !value)}
                style={styles.consentRow}
              >
                <View style={[styles.checkbox, chefTermsAccepted && styles.checkboxChecked]}>
                  {chefTermsAccepted ? <Text style={styles.checkboxTick}>✓</Text> : null}
                </View>
                <Text style={styles.consentText}>I agree to the Terms of Service and Privacy Policy.</Text>
              </Pressable>
            ) : null}
            {!isExistingCook ? <View style={styles.formDivider} /> : null}
            {!isExistingCook ? <Text style={styles.formSectionTitle}>Your cook profile</Text> : null}
            {!isExistingCook ? <>
            <AuthInput
              label="Chef or kitchen name"
              placeholder="Your public cook name"
              value={chefName}
              onChangeText={setChefName}
            />
            <AuthInput
              label="Short biography"
              placeholder="Tell customers about your cooking..."
              value={chefBio}
              onChangeText={setChefBio}
              multiline
              style={styles.bioInput}
            />
            <AuthInput
              label="Profile photo URL (optional)"
              placeholder="https://..."
              value={chefProfileImageUrl}
              onChangeText={setChefProfileImageUrl}
              autoCapitalize="none"
              keyboardType="url"
            />
            <Text style={styles.countryPickerLabel}>Which African country’s cuisine do you cook?</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.signupCountryChoices}>
              {sortCuisineCountries(countries).map((country) => (
                <Pressable
                  key={country.id ?? country.name}
                  accessibilityRole="button"
                  accessibilityState={{ selected: chefCuisine === country.name }}
                  onPress={() => setChefCuisine(country.name)}
                  style={[
                    styles.filterPill,
                    chefCuisine === country.name && styles.filterPillSelected,
                  ]}
                >
                  <Text style={[
                    styles.filterText,
                    chefCuisine === country.name && styles.filterTextSelected,
                  ]}>{country.flag} {country.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={styles.countryPickerLabel}>What services do you offer?</Text>
            <View style={styles.onboardingChoices}>
              {[
                ['prepared_meals', 'Prepared meals'],
                ['bulk_meal_prep', 'Meal prep'],
                ['in_home_cooking', 'In-home cooking'],
                ['grocery_shopping', 'Grocery shopping'],
                ['special_event', 'Special events'],
                ['postpartum', 'Postpartum meals'],
                ['recurring', 'Recurring service'],
              ].map(([value, label]) => {
                const selected = chefServiceTypes.includes(value);
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    onPress={() => setChefServiceTypes((current) =>
                      selected ? current.filter((item) => item !== value) : [...current, value],
                    )}
                    style={[styles.onboardingChip, selected && styles.onboardingChipSelected]}
                  >
                    <Text style={[styles.onboardingChipText, selected && styles.onboardingChipTextSelected]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <LocationDropdowns
              countries={marketCountries}
              apiBaseUrl={apiBaseUrl}
              countryCode={chefCountryCode}
              countryName={marketCountries.find(({ code }) => code === chefCountryCode)?.name ?? ''}
              state={chefState}
              city={chefCity}
              onCountryChange={(code, name) => {
                setChefCountryCode(code);
                setChefState('');
                setChefCity('');
                if (code.length === 2) {
                  setChefMarketingSharing(!marketingContactRequiresOptIn(code));
                  setChefMarketingSharingTouched(false);
                }
              }}
              onStateChange={setChefState}
              onCityChange={setChefCity}
            />
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: chefMarketingSharing }}
              onPress={() => {
                setChefMarketingSharing((value) => !value);
                setChefMarketingSharingTouched(true);
              }}
              style={styles.consentRow}
            >
              <View style={[
                styles.checkbox,
                chefMarketingSharing && styles.checkboxChecked,
              ]}>
                {chefMarketingSharing ? <Text style={styles.checkboxTick}>✓</Text> : null}
              </View>
              <Text style={styles.consentText}>
                {marketingContactRequiresOptIn(chefCountryCode)
                  ? 'Optional: I agree to share my name, email, and phone with AfroChop’s Google Sheets contact list for promotional updates.'
                  : 'AfroChop will store my name, email, and phone in its Google Sheets contact list for promotional updates. Uncheck to opt out.'}
              </Text>
            </Pressable>
            </> : null}
            <PrimaryButton
              label={isExistingCook ? 'Sign In' : signupLocked ? 'Registration submitted' : 'Create cook account'}
              loading={isSigningUp}
              disabled={!isExistingCook && signupLocked}
              onPress={() => void registerChef()}
            />
            {signupMessage ? <Text style={styles.signupMessage}>{signupMessage}</Text> : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setIsExistingCook((current) => !current);
                setSignupMessage(null);
              }}
            >
              <Text style={styles.linkText}>
                {isExistingCook ? 'New to AfroChop? Create a cook account' : 'Already a cook? Sign in to manage your menu'}
              </Text>
            </Pressable>
            {!isExistingCook ? <Text style={styles.formFootnote}>
              Phone verification is pending; verification codes are not available yet. A new cook profile remains under review and is not approved automatically.
            </Text> : null}
          </View>
        ) : customerSessionToken ? (
        <>
        <View style={styles.topRow}>
          <View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go to home and start fresh"
              onPress={resetCustomerHome}
              style={styles.brandRow}
            >
              <Text style={styles.brandMark}>🍲</Text>
              <Text style={styles.eyebrow}>AfroChop</Text>
              <Text style={styles.homeLinkText}>⌂ Home</Text>
            </Pressable>
            <Text style={styles.title}>A taste of home, nearby.</Text>
            <Text style={styles.tagline}>Find African cooks in your area.</Text>
          </View>
          <View style={styles.accountLinks}>
            {customerSessionToken ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setShowFarmers(true)}
                  style={styles.preferenceLink}
                >
                  <Text style={styles.preferenceLinkText}>🌽 Farmers</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setCustomerOnboarding(true)}
                  style={styles.preferenceLink}
                >
                  <Text style={styles.preferenceLinkText}>Preferences</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Sign out of your customer account"
                  onPress={() => void signOutCustomer()}
                  style={styles.cookLink}
                >
                  <Text style={styles.cookLinkText}>Sign out</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setShowCustomerAuth(true);
                  setIsExistingCustomer(true);
                  setCustomerAuthMessage(null);
                }}
                style={styles.cookLink}
              >
                <Text style={styles.cookLinkText}>Customer sign in</Text>
              </Pressable>
            )}
          </View>
        </View>

        <View style={styles.locationBlock}>
          <Text style={styles.locationLabel}>FIND COOKS NEAR</Text>
          <LocationDropdowns
            countries={marketCountries}
            apiBaseUrl={apiBaseUrl}
            countryCode={homeCountryCode}
            countryName={marketCountries.find(({ code }) => code === homeCountryCode)?.name ?? ''}
            state={stateRegion}
            city={city}
            onCountryChange={(code) => {
              setHomeCountryCode(code);
              setStateRegion('');
              setCity('');
            }}
            onStateChange={setStateRegion}
            onCityChange={setCity}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Find cooks in this location"
            onPress={() => void loadChefs()}
            style={styles.locationButton}
          >
            <Text style={styles.locationButtonText}>Find cooks</Text>
          </Pressable>
        </View>

        <View style={styles.searchBar}>
          <TextInput
            accessibilityLabel="Search chefs, dishes, or cuisines"
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={() => void loadChefs()}
            placeholder="Search chefs, dishes, or cuisines"
            placeholderTextColor="#6E6A65"
            returnKeyType="search"
            style={styles.searchInput}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search"
            onPress={() => void loadChefs()}
          >
            <Text style={styles.searchIcon}>⌕</Text>
          </Pressable>
        </View>

        <FeaturedFoodRail
          onSelectDish={(dish) => {
            setSearchText(dish);
            void loadChefs(dish);
          }}
        />

        <Text style={styles.locationLabel}>WHAT COUNTRY’S CUISINE?</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: !selectedCountryId }}
            style={[styles.filterPill, !selectedCountryId && styles.filterPillSelected]}
            onPress={() => {
              setSelectedCountryId(undefined);
            void loadChefs(searchText, null);
            }}
          >
            <Text style={[styles.filterText, !selectedCountryId && styles.filterTextSelected]}>All cuisines</Text>
          </Pressable>
          {sortCuisineCountries(countries).map((country) => (
            <Pressable
              key={country.id ?? country.name}
              accessibilityRole="button"
              accessibilityState={{ selected: country.id === selectedCountryId }}
              style={[
                styles.filterPill,
                country.id === selectedCountryId && styles.filterPillSelected,
              ]}
              onPress={() => {
                const nextId = country.id === selectedCountryId ? null : country.id;
                setSelectedCountryId(nextId ?? undefined);
                void loadChefs(searchText, nextId);
              }}
            >
              <Text style={[
                styles.filterText,
                country.id === selectedCountryId && styles.filterTextSelected,
              ]}>{country.flag} {country.name}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>{city.trim() ? `Cooks near ${city.trim()}` : 'Find a local cook'}</Text>
          <Text style={styles.verifiedLabel}>APPROVED COOKS</Text>
        </View>

        {isLoading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color={colors.terracotta} />
            <Text style={styles.stateText}>Finding available chefs…</Text>
          </View>
        ) : discoveryError ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateError}>{discoveryError}</Text>
            <Text style={styles.stateText}>Check that the AfroChop API is running and your device can reach it.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void loadChefs()}
              style={[styles.primaryButton, styles.retryButton]}
            >
              <Text style={styles.primaryButtonText}>Try again</Text>
            </Pressable>
          </View>
        ) : chefs.length === 0 ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateText}>No approved cooks match this search yet. Try another area or cuisine.</Text>
            <Pressable accessibilityRole="button" onPress={resetCustomerHome} style={[styles.primaryButton, styles.retryButton]}>
              <Text style={styles.primaryButtonText}>Clear search and start over</Text>
            </Pressable>
          </View>
        ) : selectedChef ? (
          <View style={styles.profileCard}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setSelectedChef(null)}
              style={styles.backButton}
            >
              <Text style={styles.linkText}>‹ Back to chefs</Text>
            </Pressable>
            {true ? (
              <Image source={{ uri: avatarUrl(selectedChef.displayName, selectedChef.profileImageUrl) }} style={styles.profileImage} />
            ) : null}
            <Text style={styles.chefName}>{selectedChef.displayName}</Text>
            <RatingSummary
              average={chefReviews?.averageRating ?? selectedChef.averageRating}
              count={chefReviews?.reviewCount ?? selectedChef.reviewCount}
            />
            <Text style={styles.chefMeta}>
              {[selectedChef.city, selectedChef.state].filter(Boolean).join(', ') || 'Service area not listed'}
            </Text>
            {selectedChef.bio ? <Text style={styles.profileBio}>{selectedChef.bio}</Text> : null}
            <Text style={styles.profileSpecialties}>{selectedChef.specialties.join(' · ')}</Text>
            {[
              ['Instagram', selectedChef.instagramUrl],
              ['TikTok', selectedChef.tiktokUrl],
              ['YouTube', selectedChef.youtubeUrl],
              ['Facebook', selectedChef.facebookUrl],
            ].some(([, link]) => Boolean(link)) ? (
              <View style={styles.socialLinks}>
                <Text style={styles.socialLinksTitle}>Find me on</Text>
                {([
                  ['Instagram', selectedChef.instagramUrl],
                  ['TikTok', selectedChef.tiktokUrl],
                  ['YouTube', selectedChef.youtubeUrl],
                  ['Facebook', selectedChef.facebookUrl],
                ] as const).filter(([, link]) => Boolean(link)).map(([platform, link]) => (
                  <Pressable
                    key={platform}
                    accessibilityRole="link"
                    onPress={() => {
                      if (!link) return;
                      void openChefSocialProfile(platform, link).catch((error: unknown) => {
                        setDiscoveryError(error instanceof Error
                          ? error.message
                          : `Could not open ${platform} profile.`);
                      });
                    }}
                    style={styles.socialLink}
                  >
                    <Text style={styles.socialLinkText}>Visit {platform} ›</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <View style={styles.safetyNotice}>
              <Text style={styles.safetyNoticeTitle}>Food allergy information</Text>
              <Text style={styles.safetyNoticeText}>
                Review each dish’s known ingredients, major allergens, and reported cross-contact risks. Substitutions, shared equipment, and cross-contact may create risks. Ask the cook about any concern; no allergen-free guarantee is made.
              </Text>
            </View>
            <View style={styles.profileGallery}>
              {selectedChef.foodPhotos.map((photo) => (
                <FoodMediaItem
                  key={photo.id}
                  uri={photo.imageUrl}
                  type={photo.mediaType}
                  caption={photo.caption}
                />
              ))}
            </View>
            <Text style={styles.cardTitle}>Menu</Text>
            {selectedChef.chefDishes.map((item) => (
              <View key={item.id} style={styles.menuItem}>
                <View style={styles.menuRow}>
                  <Text style={styles.dishName}>{item.dish.name}</Text>
                </View>
                {item.description ? <Text style={styles.ingredientLine}>{item.description}</Text> : null}
                <Text style={styles.ingredientLine}>Ask the cook for a quote for your order.</Text>
                <Text style={styles.ingredientLine}>
                  Known ingredients: {item.knownIngredients.join(', ') || 'Not listed'}
                </Text>
                <Text style={styles.allergenLine}>
                  Major allergens: {item.majorAllergens.length ? item.majorAllergens.join(', ') : 'Not listed by cook'}
                </Text>
                <Text style={styles.ingredientLine}>
                  Cross-contact risks: {item.crossContactRisks.join(', ') || 'Not listed by cook'}
                </Text>
              </View>
            ))}
            {selectedChef.menuEntries.map((entry) => (
              <View key={entry.id} style={styles.menuItem}>
                <View style={styles.menuRow}>
                  <Text style={styles.dishName}>{entry.name}</Text>
                  {entry.cuisineCountry ? (
                    <Text style={styles.badge}>{entry.cuisineCountry.flag} {entry.cuisineCountry.name}</Text>
                  ) : null}
                </View>
                {entry.description ? <Text style={styles.ingredientLine}>{entry.description}</Text> : null}
                <Text style={styles.ingredientLine}>Ask the cook for a quote for your order.</Text>
                <Text style={styles.ingredientLine}>
                  Known ingredients: {entry.knownIngredients.join(', ') || 'Not listed'}
                </Text>
                <Text style={styles.allergenLine}>
                  Major allergens: {entry.majorAllergens.length ? entry.majorAllergens.join(', ') : 'Not listed by cook'}
                </Text>
                <Text style={styles.ingredientLine}>
                  Cross-contact risks: {entry.crossContactRisks.join(', ') || 'Not listed by cook'}
                </Text>
              </View>
            ))}
            {selectedChef.menuTemplates.length > 0 ? (
              <View style={styles.reviewsSection}>
                <Text style={styles.cardTitle}>Party & occasion menus</Text>
                {selectedChef.menuTemplates.map((template) => (
                  <View key={template.id} style={styles.menuItem}>
                    <Text style={styles.dishName}>{template.name}</Text>
                    {template.serves ? (
                      <Text style={styles.chefMeta}>Serves about {template.serves}</Text>
                    ) : null}
                    {template.description ? (
                      <Text style={styles.ingredientLine}>{template.description}</Text>
                    ) : null}
                    <Text style={styles.ingredientLine}>
                      {template.items.map(({ menuEntry }) => menuEntry.name).join(' · ')}
                    </Text>
                    <Text style={styles.ingredientLine}>Ask the cook for a quote for this menu.</Text>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={styles.reviewsSection}>
              <Text style={styles.cardTitle}>Customer reviews</Text>
              <View style={styles.reviewSortRow}>
                {([
                  ['newest', 'Newest'],
                  ['highest', 'Highest rated'],
                  ['lowest', 'Lowest rated'],
                ] as const).map(([sort, label]) => (
                  <Pressable
                    key={sort}
                    accessibilityRole="button"
                    accessibilityState={{ selected: reviewSort === sort }}
                    onPress={() => void loadChefReviews(selectedChef.id, sort)}
                    style={[styles.reviewSortChip, reviewSort === sort && styles.reviewSortChipSelected]}
                  >
                    <Text style={[styles.reviewSortText, reviewSort === sort && styles.reviewSortTextSelected]}>
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {chefReviews?.items.length ? (
                chefReviews.items.map((review) => <ReviewCard key={review.id} review={review} />)
              ) : (
                <Text style={styles.cardText}>No published reviews yet. Completed bookings can leave verified feedback.</Text>
              )}
              <Text style={styles.reviewTrustNote}>
                Reviews are tied to completed bookings. Report or appeal requests are reviewed without removing genuine criticism solely because it is negative.
              </Text>
            </View>
            <Pressable
              style={styles.primaryButton}
              onPress={() => {
                setBookingOpen(true);
                setBookingNotice(null);
                setAllergyAcknowledged(false);
                setQuoteServiceType(selectedChef.serviceTypes[0] ?? 'prepared_meals');
                setQuoteJurisdiction(
                  selectedChef.state?.trim().length === 2
                    ? selectedChef.state.trim().toUpperCase()
                    : 'MD',
                );
                setQuoteDate('');
              }}
            >
              <Text style={styles.primaryButtonText}>Discuss an order & get a quote</Text>
            </Pressable>
            {bookingOpen ? (
              <View style={styles.bookingPanel}>
                {!customerSessionToken ? (
                  <>
                    <Text style={styles.cardTitle}>Sign in to request a quote</Text>
                    <Text style={styles.cardText}>
                      You can sign in or create your customer account first. Allergy and dietary details are requested here only when you send a quote request.
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      style={styles.primaryButton}
                      onPress={() => {
                        setShowCustomerAuth(true);
                        setIsExistingCustomer(true);
                        setCustomerAuthMessage(null);
                      }}
                    >
                      <Text style={styles.primaryButtonText}>Sign in or create an account</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Text style={styles.cardTitle}>Request a quote</Text>
                    <Text style={styles.cardText}>
                      Choose a service and the date of service, then share any allergies or dietary needs with the cook as part of your request.
                    </Text>
                    <Text style={styles.countryPickerLabel}>Service type</Text>
                    <View style={styles.allergenChoices}>
                      {selectedChef.serviceTypes.map((serviceType) => {
                        const selected = quoteServiceType === serviceType;
                        return (
                          <Pressable
                            key={serviceType}
                            accessibilityRole="radio"
                            accessibilityState={{ selected }}
                            style={[styles.allergenChoice, selected && styles.allergenChoiceSelected]}
                            onPress={() => setQuoteServiceType(serviceType)}
                          >
                            <Text style={[styles.allergenChoiceText, selected && styles.allergenChoiceTextSelected]}>
                              {serviceType.replaceAll('_', ' ')}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Text style={styles.countryPickerLabel}>Date of service *</Text>
                    <CalendarPicker
                      value={quoteDate}
                      onChange={setQuoteDate}
                      minDate={new Date(Date.now() + 24 * 60 * 60 * 1000)}
                    />
                    <Text style={styles.formFootnote}>
                      {quoteDate ? `Selected: ${parseDateKey(quoteDate).toDateString()}` : 'Please choose the date you need the service.'}
                    </Text>
                    <View style={styles.formRow}>
                      <TextInput
                        accessibilityLabel="Service duration in minutes"
                        placeholder="Duration (minutes)"
                        placeholderTextColor="#756C61"
                        value={quoteDuration}
                        onChangeText={setQuoteDuration}
                        keyboardType="number-pad"
                        style={[styles.formInput, styles.formInputHalf]}
                      />
                      <TextInput
                        accessibilityLabel="Two-letter service jurisdiction code"
                        placeholder="State code"
                        placeholderTextColor="#756C61"
                        value={quoteJurisdiction}
                        onChangeText={setQuoteJurisdiction}
                        autoCapitalize="characters"
                        maxLength={2}
                        style={[styles.formInput, styles.formInputHalf]}
                      />
                    </View>
                    <TextInput
                      accessibilityLabel="Order details for the cook"
                      placeholder="What would you like the cook to prepare?"
                      placeholderTextColor="#756C61"
                      value={quoteNotes}
                      onChangeText={setQuoteNotes}
                      multiline
                      style={styles.dietaryInput}
                    />
                    <Text style={styles.cardText}>
                      Does anyone eating this food have an allergy? Select all known allergens, then describe any other dietary needs.
                    </Text>
                    <View style={styles.allergenChoices}>
                      {majorAllergens.map((allergen) => {
                        const selected = allergySelections.includes(allergen);
                        return (
                          <Pressable
                            key={allergen}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: selected }}
                            style={[styles.allergenChoice, selected && styles.allergenChoiceSelected]}
                            onPress={() => {
                              setAllergySelections((current) =>
                                selected
                                  ? current.filter((value) => value !== allergen)
                                  : [...current, allergen],
                              );
                              setAllergyAcknowledged(false);
                            }}
                          >
                            <Text style={[styles.allergenChoiceText, selected && styles.allergenChoiceTextSelected]}>
                              {selected ? '✓ ' : ''}{allergen.replaceAll('_', ' ')}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <TextInput
                      accessibilityLabel="Dietary restrictions or other allergen details"
                      placeholder="Other allergies or dietary restrictions"
                      placeholderTextColor="#756C61"
                      value={dietaryNotes}
                      onChangeText={setDietaryNotes}
                      multiline
                      style={styles.dietaryInput}
                    />
                    <Text style={styles.safetyNoticeText}>
                      Ingredients can change. Substitutions, shared equipment, and cross-contact can create risks. The cook must review and explicitly respond to disclosed allergies before the request can proceed. No food is guaranteed allergen-free.
                    </Text>
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: allergyAcknowledged }}
                      style={styles.acknowledgmentRow}
                      onPress={() => setAllergyAcknowledged((value) => !value)}
                    >
                      <View style={[styles.checkbox, allergyAcknowledged && styles.checkboxChecked]}>
                        {allergyAcknowledged ? <Text style={styles.checkboxTick}>✓</Text> : null}
                      </View>
                      <Text style={styles.acknowledgmentText}>
                        I have reviewed this food allergy and dietary safety notice.
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ disabled: !allergyAcknowledged || isSubmittingQuote }}
                      disabled={!allergyAcknowledged || isSubmittingQuote}
                      style={[styles.primaryButton, (!allergyAcknowledged || isSubmittingQuote) && styles.buttonDisabled]}
                      onPress={() => void submitQuoteRequest()}
                    >
                      {isSubmittingQuote
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={styles.primaryButtonText}>Send quote request</Text>}
                    </Pressable>
                  </>
                )}
                {bookingNotice ? <Text style={styles.stateText}>{bookingNotice}</Text> : null}
              </View>
            ) : null}
            {discoveryError ? <Text style={styles.stateError}>{discoveryError}</Text> : null}
          </View>
        ) : (
          chefs.map((chef) => (
            <Pressable
              key={chef.id}
              accessibilityRole="button"
              onPress={() => void openChefProfile(chef.id)}
              style={styles.chefCard}
            >
              {true ? (
                <Image source={{ uri: avatarUrl(chef.displayName, chef.profileImageUrl) }} style={styles.chefImage} />
              ) : (
                <View style={styles.chefImagePlaceholder}>
                  <Text style={styles.placeholderInitial}>{chef.displayName.charAt(0)}</Text>
                </View>
              )}
              <View style={styles.chefInfo}>
                <Text style={styles.chefName}>{chef.displayName}</Text>
                <Text style={styles.chefMeta}>
                  {[chef.city, chef.state].filter(Boolean).join(', ') || chef.serviceAreas?.[0]?.city || 'Local service area'}
                </Text>
                <Text style={styles.chefCuisine} numberOfLines={1}>
                  {chef.chefDishes
                    .flatMap((item) => item.dish.dishCountries?.map(({ country }) => `${country.flag} ${country.name}`) ?? [])
                    .concat(chef.menuEntries.flatMap((entry) => entry.cuisineCountry
                      ? [`${entry.cuisineCountry.flag} ${entry.cuisineCountry.name}`]
                      : []))
                    .filter((value, index, items) => items.indexOf(value) === index)
                    .join(' · ') || chef.specialties.join(' · ') || 'African home cooking'}
                </Text>
                {chef.chefDishes[0] ? (
                  <Text style={styles.chefDishLine} numberOfLines={1}>
                    {chef.chefDishes[0].dish.name} · Ask for a quote
                  </Text>
                ) : null}
                <View style={styles.ratingRow}>
                  <Text style={styles.star}>★</Text>
                  <Text style={styles.rating}>
                    {chef.reviewCount > 0 && chef.averageRating ? ` · ${chef.reviewCount} review${chef.reviewCount === 1 ? '' : 's'}` : 'New · no reviews yet'}
                  </Text>
                </View>
                {chef.foodPhotos.length > 0 ? (
                  <Text style={styles.photoCount}>{chef.foodPhotos.length} food photos</Text>
                ) : null}
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))
        )}

        </>
        ) : entryStage === 'welcome' ? (
          <View style={styles.welcomeScreen}>
            <View style={styles.welcomePattern} />
            <AfroChopLogo />
            <Text style={styles.welcomeTitle}>A Taste of Home,{'\n'}Wherever You Are.</Text>
            <Text style={styles.welcomeTagline}>Find Your Cook. Taste Your Culture.</Text>
            <WelcomeFoodImage />
            <View style={styles.welcomeDishRow}>
              {['🍚 Jollof', '🥬 Ndolé', '🥣 Egusi', '🍢 Suya', '🫓 Injera'].map((dish) => (
                <Text key={dish} style={styles.welcomeDish}>{dish}</Text>
              ))}
            </View>
            <PrimaryButton
              label="Get Started"
              onPress={() => {
                setAuthIntent('signup');
                setEntryStage('role');
              }}
            />
            <PrimaryButton
              label="Sign In"
              secondary
              onPress={() => {
                setAuthIntent('signin');
                setEntryStage('role');
              }}
            />
            <Text style={styles.welcomeFooter}>Authentic African Food. Made with Love.</Text>
          </View>
        ) : (
          <View style={styles.signupScreen}>
            <Pressable accessibilityRole="button" onPress={() => setEntryStage('welcome')} style={styles.backButton}>
              <Text style={styles.linkText}>‹ Back</Text>
            </Pressable>
            <AfroChopLogo />
            <Text style={styles.eyebrow}>{authIntent === 'signin' ? 'WELCOME BACK' : 'JOIN THE TABLE'}</Text>
            <Text style={styles.title}>How will you use AfroChop?</Text>
            <Text style={styles.signupIntro}>
              {authIntent === 'signin'
                ? 'Choose your account type to sign in.'
                : 'Choose your account type to get started.'}
            </Text>
            <RoleSelectionCard
              icon="🍽️"
              title="I’m Looking for Food"
              description="Discover local cooks, explore menus, and request a quote."
              onPress={() => {
                setIsExistingCustomer(authIntent === 'signin');
                setCustomerTermsAccepted(false);
                setCustomerAuthMessage(null);
                setShowChefSignup(false);
                setShowCustomerAuth(true);
              }}
            />
            <RoleSelectionCard
              icon="🌽"
              title="I’m a Local Farmer"
              description="Showcase fresh corn, okra and African vegetables to nearby customers."
              onPress={() => {
                setShowCustomerAuth(false);
                setShowChefSignup(false);
                setShowFarmerAuth(true);
              }}
            />
            <RoleSelectionCard
              icon="👩🏾‍🍳"
              title="I’m a Chef / Cook"
              description="Showcase your cooking and build your AfroChop profile."
              onPress={() => {
                setIsExistingCook(authIntent === 'signin');
                setChefTermsAccepted(false);
                setSignupMessage(null);
                setShowCustomerAuth(false);
                setShowChefSignup(true);
              }}
            />
          </View>
        )}
      </ScrollView>
      )}
    </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  signupScreen: {
    backgroundColor: '#fff',
    borderRadius: 26,
    padding: 20,
    marginBottom: 24,
  },
  welcomeScreen: {
    backgroundColor: colors.cream,
    borderRadius: 28,
    marginBottom: 24,
    overflow: 'hidden',
    padding: 20,
  },
  welcomePattern: {
    borderColor: '#E8D7BC',
    borderRadius: 120,
    borderWidth: 1,
    height: 230,
    opacity: 0.45,
    position: 'absolute',
    right: -95,
    top: 80,
    width: 230,
  },
  welcomeEyebrow: {
    color: colors.terracotta,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.3,
    marginTop: 28,
  },
  welcomeTitle: {
    color: colors.forest,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 39,
    marginTop: 9,
  },
  welcomeTagline: {
    color: colors.brown,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  welcomeDishRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 18,
    marginTop: 12,
  },
  welcomeDish: {
    backgroundColor: '#fff',
    borderColor: '#E8DED0',
    borderRadius: 999,
    borderWidth: 1,
    color: colors.brown,
    fontSize: 10,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  welcomeFooter: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 15,
    textAlign: 'center',
  },
  authLoading: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 25,
  },
  authEyebrow: { marginTop: 24 },
  consentRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 16,
    minHeight: 44,
  },
  consentText: { color: colors.brown, flex: 1, fontSize: 12, lineHeight: 18 },
  preferenceAction: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center', paddingHorizontal: 4 },
  bioInput: { minHeight: 84, textAlignVertical: 'top', paddingTop: 13 },
  onboardingChoices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  onboardingChip: {
    backgroundColor: '#fff',
    borderColor: '#D9CCBD',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  onboardingChipSelected: { backgroundColor: colors.forest, borderColor: colors.forest },
  onboardingChipText: { color: colors.brown, fontSize: 12, fontWeight: '600' },
  onboardingChipTextSelected: { color: '#fff' },
  guideScreen: {
    backgroundColor: '#fff',
    borderRadius: 26,
    padding: 20,
    marginTop: 20,
  },
  guideCard: {
    backgroundColor: colors.cream,
    borderRadius: 18,
    padding: 18,
    marginTop: 8,
  },
  guideStepLabel: {
    color: colors.terracotta,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  guideStepTitle: {
    color: colors.brown,
    fontSize: 21,
    fontWeight: '800',
    marginTop: 12,
  },
  guideStepBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 8,
  },
  guideProgress: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: 18,
  },
  guideDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D9CCBD',
    marginHorizontal: 4,
  },
  guideDotActive: {
    width: 22,
    backgroundColor: colors.forest,
  },
  guideSkip: {
    alignSelf: 'center',
    padding: 12,
  },
  roleChoice: {
    backgroundColor: colors.cream,
    borderRadius: 18,
    padding: 16,
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: colors.forest,
  },
  roleChoiceTitle: {
    color: colors.brown,
    fontSize: 17,
    fontWeight: '800',
  },
  roleChoiceBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  roleChoiceAction: {
    color: colors.forest,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 12,
  },
  signupIntro: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
    marginBottom: 18,
  },
  formInput: {
    backgroundColor: '#FAF7F1',
    borderColor: '#E8DED0',
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 12,
    color: colors.brown,
    fontSize: 14,
    marginBottom: 10,
  },
  formRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  formInputHalf: {
    width: '48%',
  },
  formDivider: {
    height: 1,
    backgroundColor: '#EEE7DD',
    marginVertical: 12,
  },
  formSectionTitle: {
    color: colors.brown,
    fontWeight: '800',
    fontSize: 18,
    marginBottom: 12,
  },
  countryPickerLabel: {
    color: colors.brown,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  signupCountryChoices: {
    marginBottom: 10,
    flexGrow: 0,
  },
  signupButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginTop: 6,
  },
  signupMessage: {
    color: colors.forest,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 12,
  },
  formFootnote: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 14,
  },
  topRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
    marginBottom: 16,
  },
  accountLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 8,
    maxWidth: '100%',
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 1.2,
    color: colors.terracotta,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  brandMark: {
    fontSize: 16,
    marginRight: 6,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: colors.brown,
    marginTop: 4,
  },
  tagline: {
    color: colors.forest,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
    maxWidth: 250,
  },
  cookLink: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#E8F0E9',
    borderRadius: 999,
  },
  cookLinkText: {
    color: colors.forest,
    fontSize: 12,
    fontWeight: '800',
  },
  preferenceLink: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 10 },
  homeLinkText: { color: colors.forest, fontSize: 12, fontWeight: '800', marginLeft: 6 },
  preferenceLinkText: { color: colors.forest, fontSize: 11, fontWeight: '700' },
  locationBlock: {
    backgroundColor: '#fff',
    borderColor: '#EEE6DA',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  locationLabel: {
    color: colors.muted,
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '800',
    marginBottom: 8,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationInput: {
    flex: 1,
    color: colors.brown,
    fontSize: 14,
    paddingVertical: 5,
    minWidth: 90,
  },
  regionInput: {
    width: 72,
    color: colors.brown,
    fontSize: 14,
    paddingVertical: 5,
    marginLeft: 8,
  },
  locationButton: {
    backgroundColor: colors.forest,
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 11,
    alignItems: 'center',
  },
  locationButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 18,
  },
  searchBar: {
    backgroundColor: '#fff',
    borderColor: '#EEE6DA',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 18,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 12,
    elevation: 2,
  },
  searchInput: {
    color: '#6E6A65',
    fontSize: 14,
    flex: 1,
    padding: 0,
  },
  searchIcon: {
    fontSize: 22,
    color: '#1A1F1A',
    marginLeft: 10,
  },
  filterWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  filterScroll: {
    marginBottom: 16,
    flexGrow: 0,
  },
  filterPill: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E8DED0',
  },
  filterText: {
    color: '#4F3221',
    fontWeight: '700',
    fontSize: 12,
  },
  filterPillSelected: {
    backgroundColor: colors.forest,
    borderColor: colors.forest,
  },
  filterTextSelected: {
    color: '#fff',
  },
  heroCard: {
    backgroundColor: colors.forest,
    borderRadius: 28,
    padding: 20,
    marginBottom: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroContent: {
    flex: 1,
    paddingRight: 18,
  },
  heroTag: {
    fontSize: 11,
    color: colors.spice,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  heroTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
    marginTop: 8,
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: colors.terracotta,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    alignSelf: 'flex-start',
  },
  retryButton: { marginTop: 12 },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  heroBadge: {
    width: 70,
    height: 70,
    borderRadius: 22,
    backgroundColor: '#236A51',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadgeText: {
    fontSize: 30,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    color: colors.brown,
    fontWeight: '800',
  },
  verifiedLabel: {
    color: colors.forest,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  linkText: {
    fontSize: 12,
    color: colors.terracotta,
    fontWeight: '700',
  },
  horizontalList: {
    marginBottom: 18,
  },
  dishCard: {
    width: 220,
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 12,
    marginRight: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  dishImage: {
    width: '100%',
    height: 140,
    borderRadius: 16,
    marginBottom: 10,
  },
  dishName: {
    color: colors.brown,
    fontSize: 18,
    fontWeight: '700',
  },
  dishSubtitle: {
    color: '#6E6A65',
    fontSize: 12,
    marginTop: 4,
  },
  allergyMiniNotice: {
    color: colors.terracotta,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
  },
  dishFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  badge: {
    backgroundColor: '#F4E7D7',
    color: '#784B2A',
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 10,
  },
  chefCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#EEE6DA',
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 2,
  },
  chefImagePlaceholder: {
    width: 78,
    height: 78,
    borderRadius: 17,
    marginRight: 12,
    backgroundColor: '#EDE2D6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderInitial: {
    color: '#70462F',
    fontSize: 24,
    fontWeight: '800',
  },
  chefImage: {
    width: 78,
    height: 78,
    borderRadius: 17,
    marginRight: 12,
  },
  chefInfo: {
    flex: 1,
  },
  chefName: {
    fontSize: 15,
    color: '#1A1F1A',
    fontWeight: '700',
  },
  chefMeta: {
    color: '#6E6A65',
    fontSize: 12,
    marginTop: 4,
  },
  chefCuisine: {
    color: colors.terracotta,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 5,
  },
  chefDishLine: {
    color: colors.brown,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 5,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  star: {
    color: colors.spice,
    fontSize: 14,
    marginRight: 4,
  },
  rating: {
    color: colors.brown,
    fontWeight: '700',
    fontSize: 12,
  },
  photoCount: {
    color: colors.terracotta,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
  },
  chevron: {
    color: '#8E8982',
    fontSize: 26,
    paddingHorizontal: 8,
  },
  stateCard: {
    minHeight: 88,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#EEE6DA',
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    marginBottom: 14,
  },
  stateText: {
    color: '#6E6A65',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
  },
  stateError: {
    color: '#A43F2B',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
  },
  profileCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 22,
    marginBottom: 16,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  profileImage: {
    width: '100%',
    height: 180,
    borderRadius: 18,
    marginBottom: 14,
  },
  profileBio: {
    color: '#4F514E',
    lineHeight: 21,
    fontSize: 14,
    marginTop: 12,
  },
  profileSpecialties: {
    color: colors.terracotta,
    fontWeight: '700',
    fontSize: 12,
    marginTop: 8,
  },
  socialLinks: {
    backgroundColor: '#FBF8F3',
    borderRadius: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 14,
    padding: 12,
  },
  socialLinksTitle: {
    color: colors.brown,
    fontSize: 12,
    fontWeight: '800',
    marginRight: 7,
  },
  socialLink: {
    backgroundColor: '#E8F0E9',
    borderRadius: 999,
    marginHorizontal: 3,
    marginVertical: 4,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 11,
  },
  socialLinkText: { color: colors.forest, fontSize: 11, fontWeight: '800' },
  safetyNotice: {
    backgroundColor: colors.cream,
    borderLeftWidth: 4,
    borderLeftColor: colors.terracotta,
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
  },
  safetyNoticeTitle: {
    color: colors.brown,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 5,
  },
  safetyNoticeText: {
    color: colors.brown,
    fontSize: 12,
    lineHeight: 19,
  },
  menuItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1ECE6',
    paddingBottom: 10,
    marginBottom: 8,
  },
  ingredientLine: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  allergenLine: {
    color: colors.terracotta,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  bookingPanel: {
    backgroundColor: '#FBF8F3',
    borderRadius: 18,
    padding: 14,
    marginTop: 16,
  },
  allergenChoices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    marginBottom: 10,
  },
  allergenChoice: {
    borderWidth: 1,
    borderColor: '#D9CCBD',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginRight: 6,
    marginBottom: 7,
  },
  allergenChoiceSelected: {
    backgroundColor: colors.forest,
    borderColor: colors.forest,
  },
  allergenChoiceText: {
    color: colors.brown,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  allergenChoiceTextSelected: {
    color: '#fff',
  },
  dietaryInput: {
    minHeight: 76,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#D9CCBD',
    borderRadius: 12,
    backgroundColor: '#fff',
    padding: 11,
    color: colors.brown,
    fontSize: 13,
    marginBottom: 12,
  },
  acknowledgmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1,
    borderColor: colors.forest,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxChecked: {
    backgroundColor: colors.forest,
  },
  checkboxTick: {
    color: '#fff',
    fontWeight: '800',
  },
  acknowledgmentText: {
    flex: 1,
    color: colors.brown,
    fontSize: 12,
    lineHeight: 18,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  joinCookCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F0E9',
    padding: 16,
    borderRadius: 18,
    marginTop: 8,
    marginBottom: 12,
  },
  joinCookCopy: {
    flex: 1,
  },
  joinCookTitle: {
    color: colors.forest,
    fontSize: 15,
    fontWeight: '800',
  },
  joinCookSubtitle: {
    color: '#52695C',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  joinCookArrow: {
    color: colors.forest,
    fontSize: 26,
    paddingHorizontal: 6,
  },
  profileGallery: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginVertical: 16,
  },
  galleryImage: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: 14,
    marginRight: '2%',
    marginBottom: 8,
  },
  menuRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1ECE6',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 18,
    marginTop: 12,
    marginBottom: 12,
  },
  cardTitle: {
    color: '#1A1F1A',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  cardText: {
    color: '#4F514E',
    lineHeight: 22,
    fontSize: 14,
    marginBottom: 12,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#F5E8D8',
    borderRadius: 999,
    marginRight: 8,
    marginBottom: 8,
    color: '#5D3A22',
    fontWeight: '700',
    fontSize: 11,
  },
  cardAlt: {
    backgroundColor: colors.forest,
    borderRadius: 22,
    padding: 18,
    marginBottom: 12,
  },
  cardTitleAlt: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  cardTextAlt: {
    color: '#F0EEE8',
    lineHeight: 22,
    fontSize: 14,
  },
  reviewsSection: {
    marginTop: 22,
    borderTopWidth: 1,
    borderTopColor: '#F1ECE6',
    paddingTop: 16,
  },
  reviewSortRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  reviewSortChip: {
    borderWidth: 1,
    borderColor: '#D9CCBD',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginRight: 6,
    marginBottom: 6,
  },
  reviewSortChipSelected: {
    backgroundColor: colors.forest,
    borderColor: colors.forest,
  },
  reviewSortText: {
    color: colors.brown,
    fontSize: 11,
    fontWeight: '700',
  },
  reviewSortTextSelected: {
    color: '#fff',
  },
  reviewTrustNote: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
  },
});