export const customerReasonOptions = [
  { key: 'bulk_meal_prep', label: 'Bulk meal prep' },
  { key: 'special_event', label: 'Party or event' },
  { key: 'postpartum', label: 'Postpartum meal support' },
  { key: 'prepared_meals', label: 'Everyday African meals' },
  { key: 'in_home_cooking', label: 'Cooking in my home' },
  { key: 'other', label: 'Other / just exploring' },
] as const;

export type CustomerReason = (typeof customerReasonOptions)[number]['key'];

function isCustomerReason(value: unknown): value is CustomerReason {
  return customerReasonOptions.some((option) => option.key === value);
}

export type CustomerPreferences = {
  city: string;
  state: string;
  countryCode: string;
  favoriteCountries: string[];
  reasons: CustomerReason[];
};

export function customerPreferencesKey(apiBaseUrl: string, userId: string): string {
  return `afrochop.customer-preferences:${encodeURIComponent(apiBaseUrl)}:${userId}`;
}

export function parseCustomerPreferences(raw: string): CustomerPreferences {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw new Error('Saved customer preferences are invalid. Save your preferences again.');
  const item = value as Record<string, unknown>;
  if (typeof item.city !== 'string' || typeof item.state !== 'string' ||
      typeof item.countryCode !== 'string' || !Array.isArray(item.favoriteCountries) ||
      !item.favoriteCountries.every((country: unknown) => typeof country === 'string') ||
      (item.reasons !== undefined &&
        (!Array.isArray(item.reasons) || !item.reasons.every(isCustomerReason)))) {
    throw new Error('Saved customer preferences are invalid. Save your preferences again.');
  }
  return { city: item.city, state: item.state, countryCode: item.countryCode,
    favoriteCountries: [...new Set(item.favoriteCountries)],
    reasons: item.reasons === undefined ? [] : [...new Set(item.reasons.filter(isCustomerReason))] };
}
