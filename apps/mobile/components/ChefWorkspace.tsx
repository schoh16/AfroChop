import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ChefPayoutSetup } from './ChefPayoutSetup';
import { ChefVerificationChecklist } from './ChefVerificationChecklist';
import { marketingContactRequiresOptIn } from '../lib/marketingRegions';

type WorkspaceCountry = {
  id: string;
  name: string;
  flag: string;
};

type MenuEntry = {
  id: string;
  name: string;
  description: string | null;
  knownIngredients: string[];
  majorAllergens: string[];
  crossContactRisks: string[];
  cuisineCountry: WorkspaceCountry | null;
};

type MenuTemplate = {
  id: string;
  name: string;
  description: string | null;
  serves: number | null;
  items: Array<{ menuEntry: MenuEntry }>;
};

type ChefSocialLinks = {
  instagramUrl: string | null;
  tiktokUrl: string | null;
  youtubeUrl: string | null;
  facebookUrl: string | null;
};

type MarketingContactPreference = {
  marketingContactSharing: boolean;
  marketingCountryCode: string | null;
  marketingContactSharingUpdatedAt: string | null;
};

type ChefWorkspaceProps = {
  token: string;
  countries: WorkspaceCountry[];
  apiBaseUrl: string;
  onSignOut: () => void;
};

const allergens = [
  'milk',
  'eggs',
  'fish',
  'crustacean_shellfish',
  'tree_nuts',
  'peanuts',
  'wheat',
  'soybeans',
  'sesame',
  'other',
];

function splitList(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

export function ChefWorkspace({
  token,
  countries,
  apiBaseUrl,
  onSignOut,
}: ChefWorkspaceProps) {
  const [menu, setMenu] = useState<MenuEntry[]>([]);
  const [templates, setTemplates] = useState<MenuTemplate[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [crossContactRisks, setCrossContactRisks] = useState('');
  const [selectedAllergens, setSelectedAllergens] = useState<string[]>([]);
  const [cuisineCountryId, setCuisineCountryId] = useState<string | undefined>();
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [serves, setServes] = useState('');
  const [templateEntryIds, setTemplateEntryIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaCaption, setMediaCaption] = useState('');
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [socialLinks, setSocialLinks] = useState<ChefSocialLinks>({
    instagramUrl: null,
    tiktokUrl: null,
    youtubeUrl: null,
    facebookUrl: null,
  });
  const [marketingContactSharing, setMarketingContactSharing] = useState(false);
  const [marketingCountryCode, setMarketingCountryCode] = useState('');
  const [marketingPreferenceTouched, setMarketingPreferenceTouched] = useState(false);

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
    const body = await response.json();
    if (!response.ok) {
      const message = Array.isArray(body.message) ? body.message.join(' ') : body.message;
      throw new Error(message ?? `Request failed (${response.status}).`);
    }
    return body as T;
  }

  async function refresh() {
    setIsLoading(true);
    setError(null);
    try {
      const [entries, savedTemplates, savedSocialLinks, marketingPreference] = await Promise.all([
        request<MenuEntry[]>('/chefs/me/menu'),
        request<MenuTemplate[]>('/chefs/me/menu-templates'),
        request<ChefSocialLinks>('/chefs/me/social-links'),
        request<MarketingContactPreference>('/auth/me/marketing-contact-preference'),
      ]);
      setMenu(entries);
      setTemplates(savedTemplates);
      setSocialLinks(savedSocialLinks);
      setMarketingCountryCode(marketingPreference.marketingCountryCode ?? '');
      const hasSavedPreference = Boolean(marketingPreference.marketingContactSharingUpdatedAt);
      setMarketingContactSharing(hasSavedPreference
        ? marketingPreference.marketingContactSharing
        : Boolean(marketingPreference.marketingCountryCode) &&
          !marketingContactRequiresOptIn(marketingPreference.marketingCountryCode ?? ''));
      setMarketingPreferenceTouched(hasSavedPreference && marketingPreference.marketingContactSharing);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your menu.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [token, apiBaseUrl]);

  async function saveMarketingPreference() {
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await request<{
        marketingContactSharing: boolean;
        exportStatus: string;
      }>('/auth/me/marketing-contact-preference', {
        method: 'PATCH',
        body: JSON.stringify({
          countryCode: marketingCountryCode.trim().toUpperCase(),
          enabled: marketingContactSharing,
          explicitConsent: marketingPreferenceTouched,
        }),
      });
      setMarketingContactSharing(saved.marketingContactSharing);
      setMarketingPreferenceTouched(saved.marketingContactSharing);
      setNotice(saved.exportStatus === 'not_configured'
        ? 'Preference saved. Contact-list syncing is not configured yet.'
        : saved.marketingContactSharing
          ? 'Your contact preference is saved.'
          : 'Your contact preference is saved and your sheet entry was removed.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your contact preference.');
    } finally {
      setIsSaving(false);
    }
  }

  async function addMenuEntry() {
    if (!name.trim()) {
      setError('Enter a dish or meal name before saving.');
      return;
    }
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      await request<MenuEntry>('/chefs/me/menu', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          cuisineCountryId,
          knownIngredients: splitList(ingredients),
          majorAllergens: selectedAllergens,
          crossContactRisks: splitList(crossContactRisks),
        }),
      });
      setName('');
      setDescription('');
      setIngredients('');
      setCrossContactRisks('');
      setSelectedAllergens([]);
      setNotice('Dish saved to your cook profile.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this dish.');
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteMenuEntry(entryId: string) {
    setError(null);
    try {
      await request<{ deleted: boolean }>(`/chefs/me/menu/${entryId}`, { method: 'DELETE' });
      setTemplateEntryIds((ids) => ids.filter((id) => id !== entryId));
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove this menu item.');
    }
  }

  async function saveTemplate() {
    if (!templateName.trim() || templateEntryIds.length === 0) {
      setError('Name your template and choose at least one menu item.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      await request<MenuTemplate>('/chefs/me/menu-templates', {
        method: 'POST',
        body: JSON.stringify({
          name: templateName.trim(),
          description: templateDescription.trim() || undefined,
          serves: serves ? Number(serves) : undefined,
          menuEntryIds: templateEntryIds,
        }),
      });
      setTemplateName('');
      setTemplateDescription('');
      setServes('');
      setTemplateEntryIds([]);
      setNotice('Reusable menu template saved.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this template.');
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteTemplate(templateId: string) {
    setError(null);
    try {
      await request<{ deleted: boolean }>(`/chefs/me/menu-templates/${templateId}`, {
        method: 'DELETE',
      });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove this template.');
    }
  }

  async function addFoodMedia() {
    let url: URL;
    try {
      url = new URL(mediaUrl.trim());
    } catch {
      setError('Enter a valid HTTPS image or video URL.');
      return;
    }
    if (url.protocol !== 'https:') {
      setError('Food media must use a secure HTTPS URL.');
      return;
    }
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      await request('/chefs/me/food-photos', {
        method: 'POST',
        body: JSON.stringify({
          imageUrl: url.toString(),
          mediaType,
          caption: mediaCaption.trim() || undefined,
        }),
      });
      setMediaUrl('');
      setMediaCaption('');
      setNotice(`${mediaType === 'image' ? 'Photo' : 'Video'} added to your public food gallery.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add food media.');
    } finally {
      setIsSaving(false);
    }
  }

  async function saveSocialLinks() {
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await request<ChefSocialLinks>('/chefs/me/social-links', {
        method: 'PATCH',
        body: JSON.stringify({
          instagramUrl: socialLinks.instagramUrl?.trim() || null,
          tiktokUrl: socialLinks.tiktokUrl?.trim() || null,
          youtubeUrl: socialLinks.youtubeUrl?.trim() || null,
          facebookUrl: socialLinks.facebookUrl?.trim() || null,
        }),
      });
      setSocialLinks(saved);
      setNotice('Your social profile links have been saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save social links.');
    } finally {
      setIsSaving(false);
    }
  }

  function toggleAllergen(allergen: string) {
    setSelectedAllergens((current) => current.includes(allergen)
      ? current.filter((item) => item !== allergen)
      : [...current, allergen]);
  }

  function toggleTemplateEntry(entryId: string) {
    setTemplateEntryIds((current) => current.includes(entryId)
      ? current.filter((id) => id !== entryId)
      : [...current, entryId]);
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>CHEF WORKSPACE</Text>
          <Text style={styles.title}>Your menu, your way.</Text>
          <Text style={styles.subtitle}>
            Add the dishes you cook and save reusable packages for parties. Customers ask you for a quote.
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onSignOut} style={styles.signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>

      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {isLoading ? <ActivityIndicator color="#185A43" /> : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Your verification progress</Text>
        <Text style={styles.helper}>
          New cook profiles remain under review until AfroChop completes required checks.
        </Text>
        <ChefVerificationChecklist accessToken={token} />
      </View>
      <ChefPayoutSetup accessToken={token} />

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Promotional contact preference</Text>
        <Text style={styles.helper}>
          Choose your country of residence. European and Canadian cooks are added only after an explicit opt-in; elsewhere sharing is enabled by default and can be turned off.
        </Text>
        <TextInput
          accessibilityLabel="Country of residence code"
          autoCapitalize="characters"
          maxLength={2}
          onChangeText={(value) => {
            const normalized = value.trim().toUpperCase();
            setMarketingCountryCode(normalized);
            if (normalized.length === 2) {
              setMarketingContactSharing(!marketingContactRequiresOptIn(normalized));
              setMarketingPreferenceTouched(false);
            }
          }}
          placeholder="Country of residence (for example, US or CA)"
          value={marketingCountryCode}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: marketingContactSharing }}
          onPress={() => {
            setMarketingContactSharing((current) => !current);
            setMarketingPreferenceTouched(true);
          }}
          style={styles.templateChoice}
        >
          <View style={[styles.checkbox, marketingContactSharing && styles.checkboxSelected]}>
            {marketingContactSharing ? <Text style={styles.checkMark}>✓</Text> : null}
          </View>
          <Text style={styles.helper}>
            {marketingContactRequiresOptIn(marketingCountryCode)
              ? 'Optional: I agree to share my name, email, and phone for AfroChop promotional updates.'
              : 'Share my name, email, and phone for AfroChop promotional updates. Uncheck to opt out.'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={isSaving}
          onPress={() => void saveMarketingPreference()}
          style={[styles.primaryButton, isSaving && styles.disabled]}
        >
          <Text style={styles.primaryText}>{isSaving ? 'Saving…' : 'Save contact preference'}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Market your food</Text>
        <Text style={styles.helper}>
          Add a public HTTPS link to an image or short video hosted by your preferred media service.
        </Text>
        <View style={styles.mediaTypeRow}>
          {(['image', 'video'] as const).map((kind) => (
            <Pressable
              key={kind}
              accessibilityRole="radio"
              accessibilityState={{ selected: mediaType === kind }}
              onPress={() => setMediaType(kind)}
              style={[styles.mediaTypeChip, mediaType === kind && styles.mediaTypeChipSelected]}
            >
              <Text style={[styles.mediaTypeText, mediaType === kind && styles.mediaTypeTextSelected]}>
                {kind === 'image' ? 'Photo' : 'Short video'}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          accessibilityLabel={mediaType === 'image' ? 'Food photo URL' : 'Food video URL'}
          autoCapitalize="none"
          keyboardType="url"
          placeholder={mediaType === 'image' ? 'https://example.com/food-photo.jpg' : 'https://example.com/food-video.mp4'}
          value={mediaUrl}
          onChangeText={setMediaUrl}
          style={styles.input}
        />
        <TextInput
          accessibilityLabel="Food media caption"
          placeholder="Caption (optional)"
          value={mediaCaption}
          onChangeText={setMediaCaption}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          disabled={isSaving}
          onPress={() => void addFoodMedia()}
          style={[styles.primaryButton, isSaving && styles.disabled]}
        >
          <Text style={styles.primaryText}>{isSaving ? 'Adding…' : 'Add to food gallery'}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Connect your social profiles</Text>
        <Text style={styles.helper}>
          Share your food and cooking stories. Customers can visit these public profiles; social links do not represent AfroChop verification.
        </Text>
        {([
          ['instagramUrl', 'Instagram', 'https://instagram.com/yourname'],
          ['tiktokUrl', 'TikTok', 'https://tiktok.com/@yourname'],
          ['youtubeUrl', 'YouTube', 'https://youtube.com/@yourchannel'],
          ['facebookUrl', 'Facebook', 'https://facebook.com/yourpage'],
        ] as const).map(([key, label, placeholder]) => (
          <TextInput
            key={key}
            accessibilityLabel={`${label} profile URL`}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onChangeText={(value) => setSocialLinks((current) => ({ ...current, [key]: value }))}
            placeholder={placeholder}
            value={socialLinks[key] ?? ''}
            style={styles.input}
          />
        ))}
        <Pressable
          accessibilityRole="button"
          disabled={isSaving}
          onPress={() => void saveSocialLinks()}
          style={[styles.primaryButton, isSaving && styles.disabled]}
        >
          <Text style={styles.primaryText}>{isSaving ? 'Saving…' : 'Save social links'}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Add a dish or meal</Text>
        <TextInput
          accessibilityLabel="Dish or meal name"
          placeholder="Dish or meal name"
          value={name}
          onChangeText={setName}
          style={styles.input}
        />
        <TextInput
          accessibilityLabel="Dish description"
          placeholder="Description for customers"
          value={description}
          onChangeText={setDescription}
          multiline
          style={[styles.input, styles.multiline]}
        />
        <Text style={styles.fieldLabel}>Cuisine country</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipList}>
          {countries.map((country) => (
            <Pressable
              key={country.id}
              accessibilityRole="button"
              accessibilityState={{ selected: cuisineCountryId === country.id }}
              onPress={() => setCuisineCountryId((current) =>
                current === country.id ? undefined : country.id)}
              style={[styles.chip, cuisineCountryId === country.id && styles.chipSelected]}
            >
              <Text style={[styles.chipText, cuisineCountryId === country.id && styles.chipTextSelected]}>
                {country.flag} {country.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <TextInput
          accessibilityLabel="Known ingredients separated by commas"
          placeholder="Known ingredients (comma separated)"
          value={ingredients}
          onChangeText={setIngredients}
          style={styles.input}
        />
        <Text style={styles.fieldLabel}>Known major allergens</Text>
        <View style={styles.chipWrap}>
          {allergens.map((allergen) => {
            const selected = selectedAllergens.includes(allergen);
            return (
              <Pressable
                key={allergen}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                onPress={() => toggleAllergen(allergen)}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {allergen.replaceAll('_', ' ')}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          accessibilityLabel="Known cross-contact risks"
          placeholder="Known cross-contact risks (comma separated)"
          value={crossContactRisks}
          onChangeText={setCrossContactRisks}
          style={styles.input}
        />
        <Text style={styles.helper}>
          Ingredient and allergen details help customers ask informed questions. Never promise allergen-free food without a verified basis.
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={isSaving}
          onPress={() => void addMenuEntry()}
          style={[styles.primaryButton, isSaving && styles.disabled]}
        >
          <Text style={styles.primaryText}>{isSaving ? 'Saving…' : 'Save dish to menu'}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Your dishes</Text>
        {menu.length === 0 && !isLoading ? (
          <Text style={styles.helper}>Your saved dishes will appear here.</Text>
        ) : menu.map((entry) => (
          <View key={entry.id} style={styles.listItem}>
            <View style={styles.listCopy}>
              <Text style={styles.itemName}>{entry.name}</Text>
              <Text style={styles.helper}>
                {entry.cuisineCountry?.name ?? 'Cuisine not specified'}
                {entry.description ? ` · ${entry.description}` : ''}
              </Text>
              <Text style={styles.allergenText}>
                Allergens: {entry.majorAllergens.length ? entry.majorAllergens.join(', ') : 'None listed'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete ${entry.name}`}
              onPress={() => void deleteMenuEntry(entry.id)}
              style={styles.deleteButton}
            >
              <Text style={styles.deleteText}>Remove</Text>
            </Pressable>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Save a reusable menu template</Text>
        <Text style={styles.helper}>
          Build a package for a large party, family gathering, or other repeat order. Your quote is set with the customer.
        </Text>
        <TextInput
          accessibilityLabel="Template name"
          placeholder="Template name (for example, Large Party Feast)"
          value={templateName}
          onChangeText={setTemplateName}
          style={styles.input}
        />
        <TextInput
          accessibilityLabel="Template description"
          placeholder="Describe the occasion or package"
          value={templateDescription}
          onChangeText={setTemplateDescription}
          multiline
          style={[styles.input, styles.multiline]}
        />
        <TextInput
          accessibilityLabel="Number of people served"
          placeholder="Serves how many people? (optional)"
          value={serves}
          onChangeText={setServes}
          keyboardType="number-pad"
          style={styles.input}
        />
        <Text style={styles.fieldLabel}>Choose dishes for this template</Text>
        {menu.map((entry) => {
          const selected = templateEntryIds.includes(entry.id);
          return (
            <Pressable
              key={entry.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              onPress={() => toggleTemplateEntry(entry.id)}
              style={styles.templateChoice}
            >
              <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                {selected ? <Text style={styles.checkMark}>✓</Text> : null}
              </View>
              <Text style={styles.itemName}>{entry.name}</Text>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          disabled={isSaving}
          onPress={() => void saveTemplate()}
          style={[styles.primaryButton, isSaving && styles.disabled]}
        >
          <Text style={styles.primaryText}>{isSaving ? 'Saving…' : 'Save menu template'}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Saved templates</Text>
        {templates.length === 0 && !isLoading ? (
          <Text style={styles.helper}>Your party and occasion templates will appear here.</Text>
        ) : templates.map((template) => (
          <View key={template.id} style={styles.listItem}>
            <View style={styles.listCopy}>
              <Text style={styles.itemName}>{template.name}</Text>
              <Text style={styles.helper}>
                {template.serves ? `Serves ${template.serves} · ` : ''}
                {template.items.map(({ menuEntry }) => menuEntry.name).join(', ')}
              </Text>
              {template.description ? <Text style={styles.helper}>{template.description}</Text> : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete ${template.name} template`}
              onPress={() => void deleteTemplate(template.id)}
              style={styles.deleteButton}
            >
              <Text style={styles.deleteText}>Remove</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 18,
    paddingTop: 54,
    paddingBottom: 40,
    backgroundColor: '#F8EEDD',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerCopy: { flex: 1, paddingRight: 10 },
  eyebrow: { color: '#B84F30', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: '#3A2E22', fontSize: 28, fontWeight: '800', marginTop: 5 },
  subtitle: { color: '#756C61', fontSize: 13, lineHeight: 19, marginTop: 6 },
  signOut: { paddingHorizontal: 11, paddingVertical: 8, backgroundColor: '#fff', borderRadius: 12 },
  signOutText: { color: '#185A43', fontSize: 12, fontWeight: '700' },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 14 },
  sectionTitle: { color: '#3A2E22', fontSize: 18, fontWeight: '800', marginBottom: 12 },
  input: {
    backgroundColor: '#FAF7F1',
    borderColor: '#E8DED0',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: '#3A2E22',
    fontSize: 13,
    marginBottom: 9,
  },
  multiline: { minHeight: 68, textAlignVertical: 'top' },
  fieldLabel: { color: '#3A2E22', fontSize: 12, fontWeight: '700', marginBottom: 8, marginTop: 3 },
  chipList: { flexGrow: 0, marginBottom: 9 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#E2D6C8',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginRight: 6,
    marginBottom: 6,
    backgroundColor: '#fff',
  },
  chipSelected: { backgroundColor: '#185A43', borderColor: '#185A43' },
  chipText: { color: '#3A2E22', fontSize: 11, fontWeight: '600' },
  chipTextSelected: { color: '#fff' },
  helper: { color: '#756C61', fontSize: 12, lineHeight: 18, marginBottom: 8 },
  allergenText: { color: '#B84F30', fontSize: 11, lineHeight: 17, marginTop: 4 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#185A43',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 5,
  },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  disabled: { opacity: 0.55 },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F0EAE2',
    paddingVertical: 12,
  },
  listCopy: { flex: 1, paddingRight: 8 },
  itemName: { color: '#3A2E22', fontSize: 14, fontWeight: '800' },
  deleteButton: { paddingHorizontal: 9, paddingVertical: 7 },
  deleteText: { color: '#B84F30', fontSize: 11, fontWeight: '700' },
  templateChoice: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: '#185A43',
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },
  checkboxSelected: { backgroundColor: '#185A43' },
  checkMark: { color: '#fff', fontSize: 12, fontWeight: '800' },
  error: { color: '#A43F2B', backgroundColor: '#FBE9E4', borderRadius: 10, padding: 10, marginBottom: 12 },
  notice: { color: '#185A43', backgroundColor: '#E8F0E9', borderRadius: 10, padding: 10, marginBottom: 12 },
  mediaTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  mediaTypeChip: { borderColor: '#D9CCBD', borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9 },
  mediaTypeChipSelected: { backgroundColor: '#185A43', borderColor: '#185A43' },
  mediaTypeText: { color: '#3A2E22', fontSize: 12, fontWeight: '700' },
  mediaTypeTextSelected: { color: '#fff' },
});
