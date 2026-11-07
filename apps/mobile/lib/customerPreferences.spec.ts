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
    }))).toEqual({ city: 'La Plata', state: 'MD', countryCode: 'US', favoriteCountries: ['ng', 'cm'], reasons: [] });
  });
  it.each(['null', '{}', '{"city":5}', 'invalid'])('reports invalid saved data: %s', (raw) => {
    expect(() => parseCustomerPreferences(raw)).toThrow();
  });
  it('saves multiple reasons without duplicates and preserves Other', () => {
    expect(parseCustomerPreferences(JSON.stringify({
      city: '', state: '', countryCode: 'US', favoriteCountries: [],
      reasons: ['bulk_meal_prep', 'special_event', 'postpartum', 'other', 'bulk_meal_prep'],
    })).reasons).toEqual(['bulk_meal_prep', 'special_event', 'postpartum', 'other']);
  });
  it('allows customers to skip or clear all reasons', () => {
    expect(parseCustomerPreferences(JSON.stringify({
      city: '', state: '', countryCode: '', favoriteCountries: [], reasons: [],
    })).reasons).toEqual([]);
  });
  it.each([null, 'postpartum', ['grocery_shopping'], [42]])('rejects invalid reason data: %j', (reasons) => {
    expect(() => parseCustomerPreferences(JSON.stringify({
      city: '', state: '', countryCode: 'US', favoriteCountries: [], reasons,
    }))).toThrow('Saved customer preferences are invalid.');
  });
});
