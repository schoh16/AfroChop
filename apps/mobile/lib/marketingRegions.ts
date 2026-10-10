const marketingOptInCountryCodes = new Set([
  'AD', 'AL', 'AM', 'AT', 'AZ', 'BA', 'BE', 'BG', 'BY', 'CA', 'CH', 'CY',
  'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GB', 'GE', 'GR', 'HR', 'HU',
  'IE', 'IS', 'IT', 'KZ', 'LI', 'LT', 'LU', 'LV', 'MC', 'MD', 'ME', 'MK',
  'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'RU', 'SE', 'SI', 'SK', 'SM',
  'TR', 'UA', 'VA', 'XK',
]);

export function marketingContactRequiresOptIn(countryCode: string) {
  return marketingOptInCountryCodes.has(countryCode.toUpperCase());
}
