import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

const welcomeFoodImages = [
  {
    image: require('../assets/afrochop-ndole-platter.png'),
    title: 'Ndolé-inspired platter',
    description: 'Leafy greens, plantain & spice',
    accessibilityLabel: 'A colorful African food platter with leafy greens, shrimp, chicken, and caramelized plantain',
    searchTerm: 'Ndolé',
  },
  {
    image: require('../assets/afrochop-jollof-chicken.png'),
    title: 'Jollof & grilled chicken',
    description: 'A classic made for sharing',
    accessibilityLabel: 'A plate of jollof rice with grilled chicken, plantain, and fresh salad',
    searchTerm: 'Jollof',
  },
  { image: require('../assets/dishes/achu.jpg'), title: 'Achu', description: 'Cameroon · Cocoyam with yellow soup', accessibilityLabel: 'Achu, cocoyam served with yellow soup', searchTerm: 'Achu' },
  { image: require('../assets/dishes/eru.jpg'), title: 'Eru', description: 'Cameroon · Leafy green stew', accessibilityLabel: 'Eru, a Cameroonian leafy green stew', searchTerm: 'Eru' },
  { image: require('../assets/dishes/ndole.jpg'), title: 'Ndolé', description: 'Cameroon · Bitterleaf stew', accessibilityLabel: 'Ndolé, bitterleaf stew with shrimp', searchTerm: 'Ndolé' },
  { image: require('../assets/dishes/jollof-rice.jpg'), title: 'Jollof Rice', description: 'West Africa · Tomato rice & grilled chicken', accessibilityLabel: 'Jollof rice with grilled chicken and plantain', searchTerm: 'Jollof' },
  { image: require('../assets/dishes/egusi-soup.jpg'), title: 'Egusi Soup', description: 'Nigeria · Melon seed soup', accessibilityLabel: 'Egusi soup with leafy greens and meat', searchTerm: 'Egusi' },
  { image: require('../assets/dishes/suya.jpg'), title: 'Suya', description: 'Nigeria · Spicy grilled skewers', accessibilityLabel: 'Suya, spicy grilled meat skewers with onions', searchTerm: 'Suya' },
  { image: require('../assets/dishes/waakye.jpg'), title: 'Waakye', description: 'Ghana · Rice and beans with sides', accessibilityLabel: 'Waakye with plantain, egg, and spaghetti', searchTerm: 'Waakye' },
  { image: require('../assets/dishes/banku-tilapia.jpg'), title: 'Banku and Tilapia', description: 'Ghana · With pepper sauce', accessibilityLabel: 'Banku with grilled tilapia', searchTerm: 'Banku' },
  { image: require('../assets/dishes/puff-puff.jpg'), title: 'Puff-Puff', description: 'West Africa · Fluffy fried dough', accessibilityLabel: 'A bowl of golden puff-puff', searchTerm: 'Puff-Puff' },
  { image: require('../assets/dishes/fish-roll.jpg'), title: 'Fish Roll', description: 'Nigeria · Crispy savory pastry', accessibilityLabel: 'Fish rolls, a crispy filled pastry', searchTerm: 'Fish Roll' },
  { image: require('../assets/dishes/injera-doro-wat.jpg'), title: 'Injera with Doro Wat', description: 'Ethiopia · Spicy chicken stew', accessibilityLabel: 'Injera with doro wat and assorted sides', searchTerm: 'Injera' },
  { image: require('../assets/dishes/thieboudienne.jpg'), title: 'Thieboudienne', description: 'Senegal · Fish & broken rice', accessibilityLabel: 'Thieboudienne, Senegalese fish and rice', searchTerm: 'Thieboudienne' },
];

const colors = {
  forest: '#185A43',
  spice: '#E69B45',
  cream: '#F8EEDD',
  terracotta: '#B84F30',
  brown: '#3A2E22',
  muted: '#756C61',
};

export function AfroChopLogo({ light = false }: { light?: boolean }) {
  return (
    <View accessibilityLabel="AfroChop" style={styles.logo}>
      <View style={styles.logoMark}>
        <Text style={styles.logoMarkText}>🍲</Text>
      </View>
      <Text style={[styles.logoName, light && styles.logoNameLight]}>AfroChop</Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        secondary && styles.secondaryButton,
        (disabled || loading) && styles.disabledButton,
        pressed && !disabled && styles.pressedButton,
      ]}
    >
      {loading
        ? <ActivityIndicator color={secondary ? colors.forest : '#fff'} />
        : <Text style={[styles.primaryButtonText, secondary && styles.secondaryButtonText]}>{label}</Text>}
    </Pressable>
  );
}

export function AuthInput({
  label,
  ...props
}: TextInputProps & { label: string }) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#8B8175"
        selectionColor={colors.forest}
        style={styles.input}
        {...props}
      />
    </View>
  );
}

export function PasswordInput({ label = 'Password', ...props }: TextInputProps & { label?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.passwordRow}>
        <TextInput
          accessibilityLabel={label}
          autoCapitalize="none"
          placeholder="At least 8 characters"
          placeholderTextColor="#8B8175"
          secureTextEntry={!visible}
          selectionColor={colors.forest}
          style={[styles.input, styles.passwordInput]}
          {...props}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          accessibilityState={{ selected: visible }}
          onPress={() => setVisible((value) => !value)}
          style={styles.passwordToggle}
        >
          <Text style={styles.passwordToggleText}>{visible ? 'Hide' : 'Show'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function RoleSelectionCard({
  title,
  description,
  icon,
  selected,
  onPress,
}: {
  title: string;
  description: string;
  icon: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.roleCard,
        selected && styles.roleCardSelected,
        pressed && styles.pressedCard,
      ]}
    >
      <View style={styles.roleIcon}>
        <Text style={styles.roleIconText}>{icon}</Text>
      </View>
      <View style={styles.roleCopy}>
        <Text style={styles.roleTitle}>{title}</Text>
        <Text style={styles.roleDescription}>{description}</Text>
      </View>
      <Text style={styles.roleArrow}>›</Text>
    </Pressable>
  );
}

export function VerificationProgress({
  steps,
}: {
  steps: { label: string; status: 'complete' | 'pending' | 'current' }[];
}) {
  return (
    <View accessibilityLabel="Verification progress" style={styles.verificationList}>
      {steps.map((step, index) => (
        <View key={`${step.label}-${index}`} style={styles.verificationRow}>
          <View style={[
            styles.verificationMark,
            step.status === 'complete' && styles.verificationComplete,
            step.status === 'current' && styles.verificationCurrent,
          ]}>
            <Text style={[
              styles.verificationMarkText,
              step.status === 'complete' && styles.verificationMarkTextComplete,
            ]}>
              {step.status === 'complete' ? '✓' : String(index + 1)}
            </Text>
          </View>
          <Text style={styles.verificationLabel}>{step.label}</Text>
          <Text style={styles.verificationStatus}>
            {step.status === 'complete' ? 'Done' : step.status === 'current' ? 'In progress' : 'Upcoming'}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function AuthScreenLayout({
  children,
  onBack,
}: {
  children: ReactNode;
  onBack?: () => void;
}) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.layout}
    >
      <ScrollView
        contentContainerStyle={styles.layoutContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {onBack ? (
          <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>‹  Back</Text>
          </Pressable>
        ) : null}
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function WelcomeFoodImage() {
  return (
    <ScrollView
      horizontal
      contentContainerStyle={styles.foodImageRail}
      showsHorizontalScrollIndicator={false}
      snapToAlignment="start"
      decelerationRate="fast"
    >
      {welcomeFoodImages.map((item) => (
        <View key={item.title} style={styles.foodImageFrame}>
          <Image
            accessibilityLabel={item.accessibilityLabel}
            source={item.image}
            resizeMode="cover"
            style={styles.foodImage}
          />
          <View style={styles.foodImageShade} />
          <View style={styles.foodCaption}>
            <Text style={styles.foodCaptionTitle}>{item.title}</Text>
            <Text style={styles.foodCaptionText}>{item.description}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

export function FeaturedFoodRail({ onSelectDish }: { onSelectDish: (dish: string) => void }) {
  return (
    <View style={styles.featuredFoodSection}>
      <Text style={styles.featuredFoodHeading}>A little taste of home</Text>
      <Text style={styles.featuredFoodSubheading}>Find cooks making the dishes you love</Text>
      <ScrollView
        horizontal
        contentContainerStyle={styles.featuredFoodRail}
        showsHorizontalScrollIndicator={false}
      >
        {welcomeFoodImages.map((item) => (
          <Pressable
            key={item.title}
            accessibilityRole="button"
            accessibilityLabel={`Find cooks who make ${item.searchTerm}`}
            onPress={() => onSelectDish(item.searchTerm)}
            style={({ pressed }) => [styles.featuredFoodCard, pressed && styles.pressedCard]}
          >
            <Image
              accessibilityLabel={item.accessibilityLabel}
              source={item.image}
              resizeMode="cover"
              style={styles.featuredFoodImage}
            />
            <View style={styles.featuredFoodCopy}>
              <Text style={styles.featuredFoodTitle}>{item.title}</Text>
              <Text style={styles.featuredFoodDescription}>{item.description}</Text>
            </View>
            <Text style={styles.featuredFoodArrow}>›</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  logoMark: {
    alignItems: 'center',
    backgroundColor: colors.spice,
    borderRadius: 14,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  logoMarkText: { fontSize: 21 },
  logoName: { color: colors.forest, fontSize: 22, fontWeight: '900', letterSpacing: -0.7 },
  logoNameLight: { color: '#fff' },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.forest,
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 20,
    width: '100%',
  },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  secondaryButton: { backgroundColor: '#fff', borderColor: '#D9CCBD', borderWidth: 1 },
  secondaryButtonText: { color: colors.forest },
  disabledButton: { opacity: 0.55 },
  pressedButton: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  inputGroup: { marginBottom: 15 },
  inputLabel: { color: colors.brown, fontSize: 13, fontWeight: '700', marginBottom: 7 },
  input: {
    backgroundColor: '#fff',
    borderColor: '#E7DDCF',
    borderRadius: 14,
    borderWidth: 1,
    color: colors.brown,
    fontSize: 15,
    minHeight: 52,
    paddingHorizontal: 15,
  },
  passwordRow: { position: 'relative' },
  passwordInput: { paddingRight: 76 },
  passwordToggle: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 14,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  passwordToggleText: { color: colors.forest, fontSize: 12, fontWeight: '800' },
  roleCard: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#E8DED0',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 12,
    minHeight: 94,
    padding: 15,
  },
  roleCardSelected: { borderColor: colors.forest, borderWidth: 2 },
  pressedCard: { backgroundColor: '#FBF8F3' },
  roleIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F0E9',
    borderRadius: 15,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  roleIconText: { fontSize: 26 },
  roleCopy: { flex: 1, marginHorizontal: 13 },
  roleTitle: { color: colors.brown, fontSize: 15, fontWeight: '800' },
  roleDescription: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  roleArrow: { color: colors.forest, fontSize: 26, fontWeight: '500' },
  verificationList: { gap: 5 },
  verificationRow: { alignItems: 'center', flexDirection: 'row', minHeight: 43 },
  verificationMark: {
    alignItems: 'center',
    borderColor: '#D9CCBD',
    borderRadius: 12,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  verificationComplete: { backgroundColor: colors.forest, borderColor: colors.forest },
  verificationCurrent: { backgroundColor: '#FFF5E4', borderColor: colors.spice },
  verificationMarkText: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  verificationMarkTextComplete: { color: '#fff' },
  verificationLabel: { color: colors.brown, flex: 1, fontSize: 13, fontWeight: '600', marginLeft: 10 },
  verificationStatus: { color: colors.muted, fontSize: 10 },
  layout: { flex: 1 },
  layoutContent: { flexGrow: 1, paddingBottom: 28, paddingHorizontal: 20, paddingTop: 22 },
  backButton: { alignSelf: 'flex-start', marginBottom: 18, minHeight: 42, justifyContent: 'center' },
  backButtonText: { color: colors.forest, fontSize: 14, fontWeight: '700' },
  foodImageRail: { gap: 12, paddingRight: 20 },
  foodImageFrame: {
    backgroundColor: colors.forest,
    borderRadius: 22,
    height: 250,
    marginTop: 22,
    overflow: 'hidden',
    position: 'relative',
    width: 285,
  },
  foodImage: { height: '100%', width: '100%' },
  foodImageShade: {
    backgroundColor: 'rgba(24, 40, 28, 0.14)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  foodCaption: { bottom: 0, left: 0, padding: 18, position: 'absolute', right: 0 },
  foodCaptionTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  foodCaptionText: { color: '#fff', fontSize: 12, fontWeight: '600', marginTop: 5 },
  featuredFoodSection: { marginBottom: 20 },
  featuredFoodHeading: { color: colors.brown, fontSize: 20, fontWeight: '800' },
  featuredFoodSubheading: { color: colors.muted, fontSize: 12, marginTop: 3 },
  featuredFoodRail: { gap: 10, paddingRight: 20, paddingTop: 11 },
  featuredFoodCard: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#E8DED0',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden',
    padding: 8,
    width: 270,
  },
  featuredFoodImage: { backgroundColor: colors.cream, borderRadius: 12, height: 74, width: 74 },
  featuredFoodCopy: { flex: 1, paddingHorizontal: 10 },
  featuredFoodTitle: { color: colors.brown, fontSize: 13, fontWeight: '800' },
  featuredFoodDescription: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  featuredFoodArrow: { color: colors.forest, fontSize: 25, fontWeight: '700', paddingRight: 4 },
});
