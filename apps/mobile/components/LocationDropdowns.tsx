import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const usStates = ['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

function mergeOptions(base: string[], extra: string[]) {
  return [...new Set([...extra, ...base])].sort((a, b) => a.localeCompare(b));
}

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
  const [typed, setTyped] = useState(false);
  const query = typed ? value.trim().toLowerCase() : '';
  const filteredOptions = options.filter((option) => option.toLowerCase().includes(query));

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint="Type to search or choose a suggested location"
        editable={!disabled}
        onChangeText={(text) => {
          onChangeText(text);
          setTyped(true);
          setExpanded(true);
        }}
        onFocus={() => {
          setTyped(false);
          setExpanded(true);
        }}
        placeholder={placeholder}
        placeholderTextColor="#8B8175"
        value={value}
        style={[styles.input, disabled && styles.inputDisabled]}
      />
      <Text pointerEvents="none" style={styles.caret}>▾</Text>
      </View>
      {expanded && !disabled && filteredOptions.length > 0 ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          style={styles.optionList}
        >
          {filteredOptions.map((option) => (
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
          <Text style={styles.closeText}>Close</Text>
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
        options={mergeOptions(
          stateSuggestions?.countryCode === countryCode ? stateSuggestions.options : [],
          countryCode === 'US' ? usStates : [],
        )}
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
        Pick from the lists, or type to search. Cities listed are where cooks and farmers are currently active; you can type another.
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
    paddingRight: 34,
  },
  caret: { color: colors.muted, fontSize: 14, position: 'absolute', right: 14, top: 17 },
  inputDisabled: { backgroundColor: '#F2EEE7', opacity: 0.75 },
  optionList: {
    backgroundColor: '#fff',
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    maxHeight: 220,
    marginTop: 3,
  },
  option: { borderBottomColor: '#F1ECE6', borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 42, justifyContent: 'center', paddingHorizontal: 14 },
  optionText: { color: colors.brown, fontSize: 14 },
  closeMenu: { alignSelf: 'flex-end', paddingHorizontal: 6, paddingVertical: 6 },
  closeText: { color: colors.forest, fontSize: 11, fontWeight: '700' },
  helper: { color: colors.muted, fontSize: 11, lineHeight: 17, marginBottom: 12 },
  error: { color: '#A43F2B', fontSize: 12, marginBottom: 10 },
});
