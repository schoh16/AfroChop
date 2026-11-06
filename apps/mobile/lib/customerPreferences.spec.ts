import { describe, expect, it } from 'vitest';
import { customerPreferencesKey, parseCustomerPreferences } from './customerPreferences';

describe('customer preferences', () => {
  it('isolates preferences by account and API environment', () => {
    expect(customerPreferencesKey('https://test.example/api', 'one'))
      .not.toBe(customerPreferencesKey('https://test.example/api', 'two'));
    expect(customerPreferencesKey('https://test.example/api', 'one'))
      .not.toBe(customerPreferencesKey('https://live.example/api', 'one'));
  });
  it('restores location and selected cuisines without duplicates', () => {
    expect(parseCustomerPreferences(JSON.stringify({
      city: 'La Plata', state: 'MD', countryCode: 'US', favoriteCountries: ['ng', 'ng', 'cm'],
    }))).toEqual({ city: 'La Plata', state: 'MD', countryCode: 'US', favoriteCountries: ['ng', 'cm'] });
  });
  it.each(['null', '{}', '{"city":5}', 'invalid'])('reports invalid saved data: %s', (raw) => {
    expect(() => parseCustomerPreferences(raw)).toThrow();
  });
});
