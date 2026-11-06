export type CustomerPreferences = {
  city: string;
  state: string;
  countryCode: string;
  favoriteCountries: string[];
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
      !item.favoriteCountries.every((country: unknown) => typeof country === 'string')) {
    throw new Error('Saved customer preferences are invalid. Save your preferences again.');
  }
  return { city: item.city, state: item.state, countryCode: item.countryCode,
    favoriteCountries: [...new Set(item.favoriteCountries)] };
}
