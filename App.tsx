import { StatusBar } from 'expo-status-bar';
import {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Category = {
  id: string;
  name: string;
  icon: string;
  color: string;
};

type Dish = {
  id: string;
  name: string;
  price: string;
  description: string;
  rating: number;
  badge: string;
  color: string;
  image: string;
};

const categories: Category[] = [
  { id: 'pizza', name: 'Pizza', icon: '🍕', color: '#FFE7D6' },
  { id: 'burger', name: 'Burgers', icon: '🍔', color: '#FFE0E0' },
  { id: 'salad', name: 'Salads', icon: '🥗', color: '#E5F7D3' },
  { id: 'drinks', name: 'Drinks', icon: '🥤', color: '#DDEBFF' },
  { id: 'dessert', name: 'Desserts', icon: '🍰', color: '#FDE3FF' },
];

const dishes: Dish[] = [
  {
    id: '1',
    name: 'Sunset Tacos',
    price: '$12.99',
    description: 'Crispy chicken, peppers, lime slaw',
    rating: 4.8,
    badge: 'Hot',
    color: '#FFEDD5',
    image:
      'https://images.unsplash.com/photo-1552332386-f8dd00dc2f85?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: '2',
    name: 'Garden Bowl',
    price: '$14.50',
    description: 'Avocado, quinoa, roasted veggies',
    rating: 4.9,
    badge: 'Fresh',
    color: '#E0F2FE',
    image:
      'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: '3',
    name: 'Fire Pasta',
    price: '$16.25',
    description: 'Spicy tomato sauce, basil, parmesan',
    rating: 4.7,
    badge: 'Popular',
    color: '#FDE68A',
    image:
      'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: '4',
    name: 'Berry Smoothie',
    price: '$8.40',
    description: 'Mixed berries, almond milk, chia',
    rating: 4.6,
    badge: 'New',
    color: '#FCE7F3',
    image:
      'https://images.unsplash.com/photo-1505253758473-96b7015fcd40?auto=format&fit=crop&w=900&q=80',
  },
];

const suggested = [
  { name: 'Free delivery', icon: '🚚' },
  { name: '24 min', icon: '⏱️' },
  { name: 'Healthy', icon: '🥬' },
];

export default function App() {
  return (
    <View style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Good morning</Text>
            <Text style={styles.title}>Daniella</Text>
          </View>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>DM</Text>
          </View>
        </View>

        <View style={styles.searchBar}>
          <Text style={styles.searchText}>Search for meals or restaurants</Text>
          <Text style={styles.searchIcon}>⌕</Text>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroTextWrap}>
            <Text style={styles.heroLabel}>Weekend special</Text>
            <Text style={styles.heroTitle}>50% off on family meals</Text>
            <Pressable style={styles.ctaButton}>
              <Text style={styles.ctaText}>Order now</Text>
            </Pressable>
          </View>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>🔥</Text>
          </View>
        </View>

        <View style={styles.quickInfoRow}>
          {suggested.map((item) => (
            <View key={item.name} style={styles.quickInfoItem}>
              <Text style={styles.quickInfoIcon}>{item.icon}</Text>
              <Text style={styles.quickInfoText}>{item.name}</Text>
            </View>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Categories</Text>
          <Text style={styles.linkText}>See all</Text>
        </View>

        <FlatList
          data={categories}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryList}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable key={item.id} style={[styles.categoryChip, { backgroundColor: item.color }]}>
              <Text style={styles.categoryIcon}>{item.icon}</Text>
              <Text style={styles.categoryName}>{item.name}</Text>
            </Pressable>
          )}
        />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Popular now</Text>
          <Text style={styles.linkText}>Filter</Text>
        </View>

        <View style={styles.dishGrid}>
          {dishes.map((dish) => (
            <Pressable key={dish.id} style={[styles.dishCard, { backgroundColor: dish.color }]}>
              <View style={styles.badgeContainer}>
                <Text style={styles.badge}>{dish.badge}</Text>
              </View>
              <Image source={{ uri: dish.image }} style={styles.dishImage} />
              <Text style={styles.dishName}>{dish.name}</Text>
              <Text style={styles.dishDescription}>{dish.description}</Text>
              <View style={styles.dishMeta}>
                <Text style={styles.star}>★ {dish.rating}</Text>
                <Text style={styles.price}>{dish.price}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={styles.bottomNav}>
        <Text style={styles.navItemActive}>Home</Text>
        <Text style={styles.navItem}>Favorites</Text>
        <View style={styles.cartButton}>
          <Text style={styles.cartText}>Cart</Text>
        </View>
        <Text style={styles.navItem}>Orders</Text>
        <Text style={styles.navItem}>Profile</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8F5F2',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  eyebrow: {
    fontSize: 15,
    color: '#7A6F68',
    marginBottom: 4,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: '#1F1A17',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#1F1A17',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  searchBar: {
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  searchText: {
    color: '#8E7F79',
    fontSize: 15,
  },
  searchIcon: {
    fontSize: 22,
    color: '#1F1A17',
  },
  heroCard: {
    marginTop: 22,
    backgroundColor: '#1F1A17',
    borderRadius: 28,
    padding: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroTextWrap: {
    flex: 1,
    paddingRight: 14,
  },
  heroLabel: {
    color: '#F4B167',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '700',
  },
  heroTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    marginTop: 8,
    lineHeight: 32,
  },
  ctaButton: {
    backgroundColor: '#F3A953',
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    marginTop: 14,
  },
  ctaText: {
    color: '#1F1A17',
    fontWeight: '700',
    fontSize: 14,
  },
  heroBadge: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: '#2B2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadgeText: {
    fontSize: 30,
  },
  quickInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 22,
  },
  quickInfoItem: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 12,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  quickInfoIcon: {
    fontSize: 20,
    marginBottom: 6,
  },
  quickInfoText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2B2A2A',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 26,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 25,
    fontWeight: '700',
    color: '#1F1A17',
  },
  linkText: {
    color: '#ED8C3C',
    fontWeight: '700',
    fontSize: 14,
  },
  categoryList: {
    paddingRight: 18,
  },
  categoryChip: {
    width: 110,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    marginRight: 12,
  },
  categoryIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F1A17',
  },
  dishGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  dishCard: {
    width: '48%',
    borderRadius: 24,
    padding: 12,
    marginBottom: 16,
  },
  badgeContainer: {
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  badge: {
    backgroundColor: '#fff',
    color: '#1F1A17',
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 11,
  },
  dishImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 18,
    marginBottom: 12,
  },
  dishName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F1A17',
    marginBottom: 4,
  },
  dishDescription: {
    fontSize: 12,
    color: '#665E5A',
    lineHeight: 18,
    marginBottom: 12,
  },
  dishMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  star: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1F1A17',
  },
  price: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1F1A17',
  },
  bottomNav: {
    position: 'absolute',
    bottom: 16,
    left: 18,
    right: 18,
    backgroundColor: '#1F1A17',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  navItem: {
    color: '#D4CFC9',
    fontSize: 12,
    fontWeight: '600',
  },
  navItemActive: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  cartButton: {
    backgroundColor: '#F3A953',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cartText: {
    color: '#1F1A17',
    fontWeight: '800',
    fontSize: 12,
  },
});
