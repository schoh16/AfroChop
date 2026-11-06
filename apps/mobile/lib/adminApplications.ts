export type ApplicationStatus = 'submitted' | 'visit_scheduled' | 'interviewed' | 'profile_setup' | 'rejected';

export const applicationStatusLabels: Record<ApplicationStatus, string> = {
  submitted: 'New application',
  visit_scheduled: 'Visit scheduled',
  interviewed: 'Interview completed',
  profile_setup: 'Published',
  rejected: 'Rejected',
};

export type AdminApplication = {
  id: string;
  status: ApplicationStatus;
  submittedAt: string;
  visitScheduledAt: string | null;
  interviewedAt: string | null;
  profileSetupAt: string | null;
  adminNotes: string | null;
  chef: {
    id: string;
    displayName: string;
    profileImageUrl: string | null;
    menuEntries: { id: string; name: string }[];
    user: { id: string; name: string; email: string; phoneNumberLast4: string | null };
  };
};

export type VisitAddress = {
  applicantDetails?: {
    phoneNumber: string;
    experienceYears: number | null;
    countryOfOrigin: string;
    meetingAvailability: string;
  } | null;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
};

export type ApplicationReview = {
  status: ApplicationStatus;
  expectedStatus: ApplicationStatus;
  adminNotes: string;
  visitScheduledAt?: string;
};

export function approvedApplicationCount(applications: readonly Pick<AdminApplication, 'status'>[]): number {
  return applications.filter((application) => application.status === 'profile_setup').length;
}

export function nextApplicationStatus(status: ApplicationStatus): ApplicationStatus | null {
  switch (status) {
    case 'submitted': return 'visit_scheduled';
    case 'visit_scheduled': return 'interviewed';
    case 'interviewed': return 'profile_setup';
    default: return null;
  }
}

export function publicationBlocker(application: AdminApplication): string | null {
  if (!application.chef.profileImageUrl) return 'The cook must add a profile photo before publication.';
  if (!application.chef.menuEntries.length) return 'The cook must add at least one food before publication.';
  return null;
}

export function visitTimeToIso(day: string, time: string, now = new Date()): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error('Choose a visit date and enter a time in 24-hour HH:MM format.');
  }
  const [year, month, date] = day.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  const scheduled = new Date(year, month - 1, date, hours, minutes);
  // Reject invalid dates and local times skipped by daylight-saving changes.
  if (scheduled.getFullYear() !== year || scheduled.getMonth() !== month - 1 ||
      scheduled.getDate() !== date || scheduled.getHours() !== hours || scheduled.getMinutes() !== minutes) {
    throw new Error('That date or local time does not exist. Choose another visit time.');
  }
  if (scheduled <= now) throw new Error('The home visit must be scheduled for a future date and time.');
  return scheduled.toISOString();
}
