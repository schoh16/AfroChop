const explicitCurrencyByCountry: Record<string, string> = {
  US: 'usd',
  CA: 'cad',
  GB: 'gbp',
  CH: 'chf',
  NO: 'nok',
  SE: 'sek',
  DK: 'dkk',
  PL: 'pln',
  CZ: 'czk',
  HU: 'huf',
  RO: 'ron',
  BG: 'bgn',
  IS: 'isk',
  TR: 'try',
  UA: 'uah',
  MD: 'mdl',
  RS: 'rsd',
  AL: 'all',
  BA: 'bam',
  MK: 'mkd',
  GE: 'gel',
  AM: 'amd',
  AZ: 'azn',
  KZ: 'kzt',
  BY: 'byn',
  RU: 'rub',
};

const euroCountryCodes = new Set([
  'AD', 'AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT',
  'LT', 'LU', 'LV', 'MC', 'ME', 'MT', 'NL', 'PT', 'SI', 'SK', 'SM', 'VA', 'XK',
]);

export function checkoutCurrencyForCountry(countryCode: string | null | undefined) {
  const normalized = countryCode?.trim().toUpperCase();
  if (!normalized) return 'usd';
  if (euroCountryCodes.has(normalized)) return 'eur';
  return explicitCurrencyByCountry[normalized] ?? 'usd';
}
