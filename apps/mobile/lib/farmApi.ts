import { authenticatedFetch as fetch } from './session';

export type Produce = {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  price: string | null;
  unit: string | null;
  isAvailable?: boolean;
};

export type Farmer = {
  id: string;
  userId: string;
  farmName: string;
  bio: string | null;
  city: string;
  state: string | null;
  offersPickup: boolean;
  offersDelivery: boolean;
  profileImageUrl?: string | null;
  photos?: { id: string; imageUrl: string; mediaType?: 'image' | 'video'; caption: string | null }[];
  produce: Produce[];
};

export type FarmInquiry = {
  id: string;
  produceName: string | null;
  quantity: string | null;
  message: string;
  status: 'requested' | 'quoted' | 'declined' | 'closed';
  quoteAmount: string | null;
  quoteNotes: string | null;
  customerId: string;
  customer?: { id: string; name: string };
  farmer?: { id: string; userId: string; farmName: string; city: string; state: string | null };
};

export type ChatMessage = {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  createdAt: string;
};

export class FarmApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'FarmApiError';
  }
}

export function createFarmApi(apiBaseUrl: string, token?: string) {
  return async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message = Array.isArray(body?.message) ? body.message.join(' ') : body?.message;
      throw new FarmApiError(message ?? `Request failed (${response.status}).`, response.status);
    }
    return body as T;
  };
}

export function formatPrice(price: string | null, unit: string | null) {
  if (price === null || price === undefined) return 'Ask for price';
  return `$${Number(price).toFixed(2)}${unit ? ` / ${unit}` : ''}`;
}

export const farmTheme = {
  forest: '#185A43',
  spice: '#E69B45',
  cream: '#F8EEDD',
  terracotta: '#B84F30',
  brown: '#3A2E22',
  muted: '#756C61',
};
