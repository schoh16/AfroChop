import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type CountryOption = { code?: string; name: string };

const colors = {
  forest: '#185A43',
  cream: '#F8EEDD',
  brown: '#3A2E22',
  muted: '#756C61',
  border: '#E7DDCF',
};

function DropdownField({
  label,
  placeholder,
  value,
  options,
  disabled,
  onChangeText,
  onSelect,
}: {
  label: string;
  placeholder: string;
  value: string;
  options: string[];
  disabled?: boolean;
  onChangeText: (value: string) => void;
  onSelect: (value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const filteredOptions = options.filter((option) =>
    option.toLowerCase().includes(value.trim().toLowerCase()),
  );

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint="Type to search or choose a suggested location"
        editable={!disabled}
        onChangeText={(text) => {
          onChangeText(text);
          setExpanded(true);
        }}
        onFocus={() => setExpanded(true)}
        placeholder={placeholder}
        placeholderTextColor="#8B8175"
        value={value}
        style={[styles.input, disabled && styles.inputDisabled]}
      />
      {expanded && !disabled && filteredOptions.length > 0 ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          style={styles.optionList}
        >
          {filteredOptions.slice(0, 10).map((option) => (
            <Pressable
              key={option}
              accessibilityRole="button"
              onPress={() => {
                onSelect(option);
                setExpanded(false);
              }}
              style={styles.option}
            >
              <Text style={styles.optionText}>{option}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {expanded ? (
        <Pressable accessibilityRole="button" onPress={() => setExpanded(false)} style={styles.closeMenu}>
          <Text style={styles.closeText}>Close suggestions</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function LocationDropdowns({
  countries,
  apiBaseUrl,
  countryCode,
  countryName,
  state,
  city,
  onCountryChange,
  onStateChange,
  onCityChange,
}: {
  countries: CountryOption[];
  apiBaseUrl: string;
  countryCode: string;
  countryName: string;
  state: string;
  city: string;
  onCountryChange: (code: string, name: string) => void;
  onStateChange: (value: string) => void;
  onCityChange: (value: string) => void;
}) {
  const [stateSuggestions, setStateSuggestions] = useState<{
    countryCode: string;
    options: string[];
  } | null>(null);
  const [citySuggestions, setCitySuggestions] = useState<{
    countryCode: string;
    state: string;
    options: string[];
  } | null>(null);
  const [suggestionError, setSuggestionError] = useState<{
    countryCode: string;
    state: string | null;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!countryCode) return;
    let active = true;
    fetch(`${apiBaseUrl}/catalog/locations/states?countryCode=${encodeURIComponent(countryCode)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`State list failed (${response.status}).`);
        return response.json() as Promise<string[]>;
      })
      .then((data) => {
        if (active) setStateSuggestions({ countryCode, options: data });
      })
      .catch((cause: unknown) => {
        if (active) {
          setSuggestionError({
            countryCode,
            state: null,
            message: cause instanceof Error ? cause.message : 'Could not load states.',
          });
        }
      });
    return () => {
      active = false;
    };
  }, [apiBaseUrl, countryCode]);

  useEffect(() => {
    const normalizedState = state.trim();
    if (!countryCode || !normalizedState) return;
    let active = true;
    const query = new URLSearchParams({ countryCode, state: normalizedState });
    fetch(`${apiBaseUrl}/catalog/locations/cities?${query.toString()}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`City list failed (${response.status}).`);
        return response.json() as Promise<string[]>;
      })
      .then((data) => {
        if (active) setCitySuggestions({ countryCode, state: normalizedState, options: data });
      })
      .catch((cause: unknown) => {
        if (active) {
          setSuggestionError({
            countryCode,
            state: normalizedState,
            message: cause instanceof Error ? cause.message : 'Could not load cities.',
          });
        }
      });
    return () => {
      active = false;
    };
  }, [apiBaseUrl, countryCode, state]);

  const visibleError = suggestionError?.countryCode === countryCode &&
    ((suggestionError.state === null && !state.trim()) || suggestionError.state === state.trim())
    ? suggestionError.message
    : null;

  return (
    <View>
      <DropdownField
        label="Country"
        placeholder="Choose a country"
        value={countryName}
        options={countries.map(({ name }) => name)}
        onChangeText={(value) => {
          const match = countries.find(({ name }) => name.toLowerCase() === value.trim().toLowerCase());
          onCountryChange(match?.code ?? '', value);
        }}
        onSelect={(name) => {
          const selected = countries.find((country) => country.name === name);
          if (selected?.code) onCountryChange(selected.code, selected.name);
        }}
      />
      <DropdownField
        label="State / region"
        placeholder="Choose or enter a state"
        value={state}
        options={stateSuggestions?.countryCode === countryCode ? stateSuggestions.options : []}
        disabled={!countryCode}
        onChangeText={(value) => {
          onStateChange(value);
          onCityChange('');
        }}
        onSelect={(value) => {
          onStateChange(value);
          onCityChange('');
        }}
      />
      <DropdownField
        label="City"
        placeholder="Choose or enter a city"
        value={city}
        options={
          citySuggestions?.countryCode === countryCode && citySuggestions.state === state.trim()
            ? citySuggestions.options
            : []
        }
        disabled={!countryCode}
        onChangeText={onCityChange}
        onSelect={onCityChange}
      />
      <Text style={styles.helper}>
        Suggestions show locations where approved cooks currently offer service. You can type another location.
      </Text>
      {visibleError ? <Text accessibilityRole="alert" style={styles.error}>{visibleError}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 12, zIndex: 2 },
  label: { color: colors.brown, fontSize: 13, fontWeight: '700', marginBottom: 7 },
  input: {
    backgroundColor: '#fff',
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.brown,
    fontSize: 14,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  inputDisabled: { backgroundColor: '#F2EEE7', opacity: 0.75 },
  optionList: {
    backgroundColor: '#fff',
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    maxHeight: 180,
    marginTop: 3,
  },
  option: { borderBottomColor: '#F1ECE6', borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 42, justifyContent: 'center', paddingHorizontal: 14 },
  optionText: { color: colors.brown, fontSize: 14 },
  closeMenu: { alignSelf: 'flex-end', paddingHorizontal: 6, paddingVertical: 6 },
  closeText: { color: colors.forest, fontSize: 11, fontWeight: '700' },
  helper: { color: colors.muted, fontSize: 11, lineHeight: 17, marginBottom: 12 },
  error: { color: '#A43F2B', fontSize: 12, marginBottom: 10 },
});
