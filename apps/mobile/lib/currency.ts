const explicitCurrencyByCountry: Record<string, string> = {
  US: 'USD',
  CA: 'CAD',
  GB: 'GBP',
  CH: 'CHF',
  NO: 'NOK',
  SE: 'SEK',
  DK: 'DKK',
  PL: 'PLN',
  CZ: 'CZK',
  HU: 'HUF',
  RO: 'RON',
  BG: 'BGN',
  IS: 'ISK',
  TR: 'TRY',
  UA: 'UAH',
  MD: 'MDL',
  RS: 'RSD',
  AL: 'ALL',
  BA: 'BAM',
  MK: 'MKD',
  GE: 'GEL',
  AM: 'AMD',
  AZ: 'AZN',
  KZ: 'KZT',
  BY: 'BYN',
  RU: 'RUB',
};

const euroCountryCodes = new Set([
  'AD', 'AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT',
  'LT', 'LU', 'LV', 'MC', 'ME', 'MT', 'NL', 'PT', 'SI', 'SK', 'SM', 'VA', 'XK',
]);

export function currencyForCountry(countryCode: string | null | undefined) {
  const normalized = countryCode?.trim().toUpperCase();
  if (!normalized) return 'USD';
  if (euroCountryCodes.has(normalized)) return 'EUR';
  return explicitCurrencyByCountry[normalized] ?? 'USD';
}

export function formatCurrency(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
