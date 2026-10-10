import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const countryCatalog = [
  { name: 'Algeria', code: 'DZ', region: 'North Africa', flag: '🇩🇿', cuisineDescription: 'Tagines, couscous, and vibrant Mediterranean flavors.' },
  { name: 'Angola', code: 'AO', region: 'Southern Africa', flag: '🇦🇴', cuisineDescription: 'Hearty stews, grilled meats, and cassava-based comfort foods.' },
  { name: 'Benin', code: 'BJ', region: 'West Africa', flag: '🇧🇯', cuisineDescription: 'Palm oil sauces, yam dishes, and aromatic soups.' },
  { name: 'Botswana', code: 'BW', region: 'Southern Africa', flag: '🇧🇼', cuisineDescription: 'Traditional meats, millet, and seasonal vegetables.' },
  { name: 'Burkina Faso', code: 'BF', region: 'West Africa', flag: '🇧🇫', cuisineDescription: 'Rice-based dishes, grilled meats, and spicy sauces.' },
  { name: 'Burundi', code: 'BI', region: 'East Africa', flag: '🇧🇮', cuisineDescription: 'Banana-based foods, beans, and hearty stews.' },
  { name: 'Cabo Verde', code: 'CV', region: 'West Africa', flag: '🇨🇻', cuisineDescription: 'Seafood, corn, and rich island flavors.' },
  { name: 'Cameroon', code: 'CM', region: 'Central Africa', flag: '🇨🇲', cuisineDescription: 'Ndolé, eru, achu, and flavorful regional sauces.' },
  { name: 'Central African Republic', code: 'CF', region: 'Central Africa', flag: '🇨🇫', cuisineDescription: 'Root vegetables, stews, and locally foraged ingredients.' },
  { name: 'Chad', code: 'TD', region: 'Central Africa', flag: '🇹🇩', cuisineDescription: 'Grilled meat, millet, and spiced stews.' },
  { name: 'Comoros', code: 'KM', region: 'East Africa', flag: '🇰🇲', cuisineDescription: 'Coconut rice, spice blends, and island seafood.' },
  { name: 'Congo', code: 'CG', region: 'Central Africa', flag: '🇨🇬', cuisineDescription: 'Plantain, cassava, and aromatic stews.' },
  { name: 'Côte d’Ivoire', code: 'CI', region: 'West Africa', flag: '🇨🇮', cuisineDescription: 'Attiéké, fish soups, and cassava-based specialties.' },
  { name: 'Democratic Republic of the Congo', code: 'CD', region: 'Central Africa', flag: '🇨🇩', cuisineDescription: 'Cassava, leafy greens, and generous stews.' },
  { name: 'Djibouti', code: 'DJ', region: 'East Africa', flag: '🇩🇯', cuisineDescription: 'Spiced rice, grilled meat, and coastal ingredients.' },
  { name: 'Egypt', code: 'EG', region: 'North Africa', flag: '🇪🇬', cuisineDescription: 'Koshari, ful medames, and aromatic rice dishes.' },
  { name: 'Equatorial Guinea', code: 'GQ', region: 'Central Africa', flag: '🇬🇶', cuisineDescription: 'Coastal recipes, plantains, and savory stews.' },
  { name: 'Eritrea', code: 'ER', region: 'East Africa', flag: '🇪🇷', cuisineDescription: 'Flatbread, lentils, and spiced stews.' },
  { name: 'Eswatini', code: 'SZ', region: 'Southern Africa', flag: '🇸🇿', cuisineDescription: 'Maize, vegetables, and simple well-seasoned home meals.' },
  { name: 'Ethiopia', code: 'ET', region: 'East Africa', flag: '🇪🇹', cuisineDescription: 'Injera, lentils, and rich spice blends.' },
  { name: 'Gabon', code: 'GA', region: 'Central Africa', flag: '🇬🇦', cuisineDescription: 'Seafood, plantains, and rich sauces.' },
  { name: 'Gambia', code: 'GM', region: 'West Africa', flag: '🇬🇲', cuisineDescription: 'Groundnut stew, rice, and grilled fish.' },
  { name: 'Ghana', code: 'GH', region: 'West Africa', flag: '🇬🇭', cuisineDescription: 'Jollof, waakye, red-red, and grilled delicacies.' },
  { name: 'Guinea', code: 'GN', region: 'West Africa', flag: '🇬🇳', cuisineDescription: 'Rice dishes, sauces, and grilled meats.' },
  { name: 'Guinea-Bissau', code: 'GW', region: 'West Africa', flag: '🇬🇼', cuisineDescription: 'Seafood, rice, and cassava dishes.' },
  { name: 'Kenya', code: 'KE', region: 'East Africa', flag: '🇰🇪', cuisineDescription: 'Nyama choma, ugali, chapati, and coastal seafood.' },
  { name: 'Lesotho', code: 'LS', region: 'Southern Africa', flag: '🇱🇸', cuisineDescription: 'Maize, legumes, and home-style stews.' },
  { name: 'Liberia', code: 'LR', region: 'West Africa', flag: '🇱🇷', cuisineDescription: 'Rice, greens, soups, and cassava preparations.' },
  { name: 'Libya', code: 'LY', region: 'North Africa', flag: '🇱🇾', cuisineDescription: 'Couscous, lamb dishes, and olive-forward flavors.' },
  { name: 'Madagascar', code: 'MG', region: 'Southern Africa', flag: '🇲🇬', cuisineDescription: 'Rice, zebu, and coconut-based comfort foods.' },
  { name: 'Malawi', code: 'MW', region: 'Southern Africa', flag: '🇲🇼', cuisineDescription: 'Nsima, vegetables, and savory bean dishes.' },
  { name: 'Mali', code: 'ML', region: 'West Africa', flag: '🇲🇱', cuisineDescription: 'Rice, grilled proteins, and spice-rich sauces.' },
  { name: 'Mauritania', code: 'MR', region: 'North Africa', flag: '🇲🇷', cuisineDescription: 'Rice, fish, and slow-cooked savory meals.' },
  { name: 'Mauritius', code: 'MU', region: 'East Africa', flag: '🇲🇺', cuisineDescription: 'Curry, seafood, and Indian-African fusion flavors.' },
  { name: 'Morocco', code: 'MA', region: 'North Africa', flag: '🇲🇦', cuisineDescription: 'Tagines, couscous, preserved lemon, and warm spices.' },
  { name: 'Mozambique', code: 'MZ', region: 'Southern Africa', flag: '🇲🇿', cuisineDescription: 'Piri-piri dishes, seafood rice, and peri-peri flavors.' },
  { name: 'Namibia', code: 'NA', region: 'Southern Africa', flag: '🇳🇦', cuisineDescription: 'Game meats, maize porridge, and hearty stews.' },
  { name: 'Niger', code: 'NE', region: 'West Africa', flag: '🇳🇪', cuisineDescription: 'Millet, grilled meats, and spicy vegetable dishes.' },
  { name: 'Nigeria', code: 'NG', region: 'West Africa', flag: '🇳🇬', cuisineDescription: 'Jollof rice, egusi, pepper soup, and rich soups.' },
  { name: 'Rwanda', code: 'RW', region: 'East Africa', flag: '🇷🇼', cuisineDescription: 'Banana, beans, potatoes, and comforting stews.' },
  { name: 'Sao Tome and Principe', code: 'ST', region: 'Central Africa', flag: '🇸🇹', cuisineDescription: 'Seafood, tropical produce, and simple grilled meals.' },
  { name: 'Senegal', code: 'SN', region: 'West Africa', flag: '🇸🇳', cuisineDescription: 'Thieboudienne, yassa, and grilled fish specialties.' },
  { name: 'Seychelles', code: 'SC', region: 'East Africa', flag: '🇸🇨', cuisineDescription: 'Coconut curries, seafood, and tropical flavors.' },
  { name: 'Sierra Leone', code: 'SL', region: 'West Africa', flag: '🇸🇱', cuisineDescription: 'Rice and stew traditions with deep spice and greens.' },
  { name: 'Somalia', code: 'SO', region: 'East Africa', flag: '🇸🇴', cuisineDescription: 'Rice dishes, camel meat, and aromatic spice mixes.' },
  { name: 'South Africa', code: 'ZA', region: 'Southern Africa', flag: '🇿🇦', cuisineDescription: 'Braaied meats, bobotie, and vibrant regional cuisines.' },
  { name: 'South Sudan', code: 'SS', region: 'East Africa', flag: '🇸🇸', cuisineDescription: 'Stews, sorghum, and nourishing home meals.' },
  { name: 'Sudan', code: 'SD', region: 'North Africa', flag: '🇸🇩', cuisineDescription: 'Ful, rice, meat stews, and spice-forward dishes.' },
  { name: 'Tanzania', code: 'TZ', region: 'East Africa', flag: '🇹🇿', cuisineDescription: 'Pilau, coconut curries, and coastal seafood.' },
  { name: 'Togo', code: 'TG', region: 'West Africa', flag: '🇹🇬', cuisineDescription: 'Sauces, grains, and richly seasoned soups.' },
  { name: 'Tunisia', code: 'TN', region: 'North Africa', flag: '🇹🇳', cuisineDescription: 'Couscous, brik, and bright herb-driven recipes.' },
  { name: 'Uganda', code: 'UG', region: 'East Africa', flag: '🇺🇬', cuisineDescription: 'Luwombo, matoke, and stew-centered family meals.' },
  { name: 'Zambia', code: 'ZM', region: 'Southern Africa', flag: '🇿🇲', cuisineDescription: 'Nshima, greens, and grilled or stewed local foods.' },
  { name: 'Zimbabwe', code: 'ZW', region: 'Southern Africa', flag: '🇿🇼', cuisineDescription: 'Sadza, chicken dishes, and veggie-forward meal traditions.' },
];

const featuredDishes = [
  { name: 'Jollof Rice', country: 'Nigeria', price: '$18', chef: 'Chef Ada', description: 'Tomato-rich rice with peppers, herbs, and grilled protein.' },
  { name: 'Eru', country: 'Cameroon', price: '$17', chef: 'Chef Tendo', description: 'Creamy spinach soup served with garri or plantain.' },
  { name: 'Couscous', country: 'Morocco', price: '$16', chef: 'Chef Leila', description: 'Steamed semolina with tender vegetables and aromatic tagine.' },
  { name: 'Injera & Doro Wat', country: 'Ethiopia', price: '$19', chef: 'Chef Mulu', description: 'Fermented flatbread with spiced chicken stew.' },
  { name: 'Thieboudienne', country: 'Senegal', price: '$20', chef: 'Chef Ndeye', description: 'One-pot rice dish with fish, vegetables, and signature spice.' },
];

const chefHighlights = [
  {
    name: 'Chef Ada Okafor',
    specialty: 'Nigerian home cooking',
    city: 'Brooklyn, NY',
    rating: 4.9,
    profileImageUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=900&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1559847844-5315695dadae?auto=format&fit=crop&w=900&q=80',
    ],
  },
  {
    name: 'Chef Tendo Mba',
    specialty: 'Cameroonian sauces & family meals',
    city: 'D.C.',
    rating: 4.8,
    profileImageUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80',
    ],
  },
  {
    name: 'Chef Leila Benali',
    specialty: 'Moroccan tagines & couscous',
    city: 'Atlanta, GA',
    rating: 5.0,
    profileImageUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80',
    gallery: [
      'https://images.unsplash.com/photo-1543353071-873f17a7a088?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=900&q=80',
    ],
  },
];

const marketCountries = [
  { name: 'Albania', code: 'AL' },
  { name: 'Andorra', code: 'AD' },
  { name: 'Armenia', code: 'AM' },
  { name: 'Austria', code: 'AT' },
  { name: 'Azerbaijan', code: 'AZ' },
  { name: 'Belarus', code: 'BY' },
  { name: 'Belgium', code: 'BE' },
  { name: 'Bosnia and Herzegovina', code: 'BA' },
  { name: 'Bulgaria', code: 'BG' },
  { name: 'Canada', code: 'CA' },
  { name: 'Croatia', code: 'HR' },
  { name: 'Cyprus', code: 'CY' },
  { name: 'Czechia', code: 'CZ' },
  { name: 'Denmark', code: 'DK' },
  { name: 'Estonia', code: 'EE' },
  { name: 'Finland', code: 'FI' },
  { name: 'France', code: 'FR' },
  { name: 'Georgia', code: 'GE' },
  { name: 'Germany', code: 'DE' },
  { name: 'Greece', code: 'GR' },
  { name: 'Hungary', code: 'HU' },
  { name: 'Iceland', code: 'IS' },
  { name: 'Ireland', code: 'IE' },
  { name: 'Italy', code: 'IT' },
  { name: 'Kazakhstan', code: 'KZ' },
  { name: 'Kosovo', code: 'XK' },
  { name: 'Latvia', code: 'LV' },
  { name: 'Liechtenstein', code: 'LI' },
  { name: 'Lithuania', code: 'LT' },
  { name: 'Luxembourg', code: 'LU' },
  { name: 'Malta', code: 'MT' },
  { name: 'Moldova', code: 'MD' },
  { name: 'Monaco', code: 'MC' },
  { name: 'Montenegro', code: 'ME' },
  { name: 'Netherlands', code: 'NL' },
  { name: 'North Macedonia', code: 'MK' },
  { name: 'Norway', code: 'NO' },
  { name: 'Poland', code: 'PL' },
  { name: 'Portugal', code: 'PT' },
  { name: 'Romania', code: 'RO' },
  { name: 'Russia', code: 'RU' },
  { name: 'San Marino', code: 'SM' },
  { name: 'Serbia', code: 'RS' },
  { name: 'Slovakia', code: 'SK' },
  { name: 'Slovenia', code: 'SI' },
  { name: 'Spain', code: 'ES' },
  { name: 'Sweden', code: 'SE' },
  { name: 'Switzerland', code: 'CH' },
  { name: 'Turkey', code: 'TR' },
  { name: 'Ukraine', code: 'UA' },
  { name: 'United Kingdom', code: 'GB' },
  { name: 'United States', code: 'US' },
  { name: 'Vatican City', code: 'VA' },
];

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  getMarketCountries() {
    return marketCountries;
  }

  async getServiceAreaStates(countryCode?: string) {
    const areas = await this.prisma.chefServiceArea.findMany({
      where: {
        ...(countryCode ? { countryCode: countryCode.trim().toUpperCase() } : {}),
        state: { not: null },
        chef: { isPublic: true, verificationStatus: 'approved' },
      },
      select: { state: true },
      orderBy: { state: 'asc' },
    });
    return [...new Set(areas.map(({ state }) => state).filter((state): state is string => Boolean(state)))];
  }

  async getServiceAreaCities(countryCode?: string, state?: string) {
    const areas = await this.prisma.chefServiceArea.findMany({
      where: {
        ...(countryCode ? { countryCode: countryCode.trim().toUpperCase() } : {}),
        ...(state ? { state: { equals: state.trim(), mode: 'insensitive' } } : {}),
        city: { not: null },
        chef: { isPublic: true, verificationStatus: 'approved' },
      },
      select: { city: true },
      orderBy: { city: 'asc' },
    });
    return [...new Set(areas.map(({ city }) => city).filter((city): city is string => Boolean(city)))];
  }

  async getCountries() {
    try {
      const countries = await this.prisma.country.findMany({ orderBy: { name: 'asc' } });
      return countries.length > 0 ? countries : countryCatalog;
    } catch {
      return countryCatalog;
    }
  }

  async getFeaturedDishes() {
    try {
      const dishes = await this.prisma.dish.findMany({
        take: 6,
        orderBy: { createdAt: 'desc' },
      });

      return dishes.length > 0 ? dishes : featuredDishes;
    } catch {
      return featuredDishes;
    }
  }

  async getChefHighlights() {
    try {
      const chefs = await this.prisma.chefProfile.findMany({
        take: 3,
        orderBy: { averageRating: 'desc' },
      });

      return chefs.length > 0 ? chefs : chefHighlights;
    } catch {
      return chefHighlights;
    }
  }
}
