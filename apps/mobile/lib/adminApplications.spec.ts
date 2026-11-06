import { describe, expect, it } from 'vitest';
import { approvedApplicationCount, nextApplicationStatus, publicationBlocker, visitTimeToIso, type AdminApplication } from './adminApplications';

describe('admin application workflow', () => {
  it('counts only completed, published applications across the full queue', () => {
    expect(approvedApplicationCount([])).toBe(0);
    expect(approvedApplicationCount([
      { status: 'submitted' }, { status: 'visit_scheduled' }, { status: 'interviewed' },
      { status: 'rejected' }, { status: 'profile_setup' }, { status: 'profile_setup' },
    ])).toBe(2);
  });

  it('updates the count when a saved application completes setup', () => {
    const applications: Pick<AdminApplication, 'status'>[] = [{ status: 'interviewed' }];
    expect(approvedApplicationCount(applications)).toBe(0);
    applications[0] = { status: 'profile_setup' };
    expect(approvedApplicationCount(applications)).toBe(1);
  });

  it('offers only ordered visit, interview, and publication transitions', () => {
    expect(nextApplicationStatus('submitted')).toBe('visit_scheduled');
    expect(nextApplicationStatus('visit_scheduled')).toBe('interviewed');
    expect(nextApplicationStatus('interviewed')).toBe('profile_setup');
    expect(nextApplicationStatus('profile_setup')).toBeNull();
    expect(nextApplicationStatus('rejected')).toBeNull();
  });

  it('requires both a photo and a food before offering publication', () => {
    const chef: AdminApplication['chef'] = { id: 'chef', displayName: 'Cook', profileImageUrl: null, menuEntries: [],
      user: { id: 'user', name: 'Cook', email: 'cook@example.test', phoneNumberLast4: null } };
    const application: AdminApplication = {
      id: 'id', status: 'interviewed', submittedAt: '2030-01-01T12:00:00Z',
      visitScheduledAt: null, interviewedAt: null, profileSetupAt: null, adminNotes: null, chef,
    };
    expect(publicationBlocker(application)).toContain('profile photo');
    application.chef.profileImageUrl = 'https://example.test/photo.jpg';
    expect(publicationBlocker(application)).toContain('at least one food');
    application.chef.menuEntries = [{ id: 'food', name: 'Jollof rice' }];
    expect(publicationBlocker(application)).toBeNull();
  });

  it('converts a valid device-local visit to an explicit UTC timestamp', () => {
    expect(visitTimeToIso('2030-05-20', '14:30', new Date(2030, 4, 19)))
      .toBe(new Date(2030, 4, 20, 14, 30).toISOString());
  });

  it.each([
    ['2030-02-30', '12:00'], ['2030-02-20', '25:00'], ['2030-02-20', '9:00'],
    ['', '12:00'], ['2030-01-01', '12:00'],
  ])('rejects invalid or past visit values %s %s', (day, time) => {
    expect(() => visitTimeToIso(day, time, new Date(2030, 0, 2))).toThrow();
  });
});
