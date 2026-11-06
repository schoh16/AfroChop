import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type SelectionOption = { key: string; label: string };

export function SelectionDropdown({ label, options, selectedKeys, multiple = false, emptyLabel, emptyMessage, disabled = false, onSelect }: {
  label: string;
  options: SelectionOption[];
  selectedKeys: string[];
  multiple?: boolean;
  emptyLabel: string;
  emptyMessage: string;
  disabled?: boolean;
  onSelect: (key: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const selectedLabels = options.filter((option) => selectedKeys.includes(option.key)).map((option) => option.label);
  const summary = selectedLabels.length ? selectedLabels.join(', ') : emptyLabel;

  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${summary}`}
      accessibilityState={{ expanded, disabled }} disabled={disabled}
      onPress={() => setExpanded((value) => !value)} style={styles.trigger}>
      <Text style={styles.text}>{summary}</Text>
      <Text style={styles.caret}>{expanded ? 'Close' : 'Select'}</Text>
    </Pressable>
    {expanded ? <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={styles.options}>
      {!multiple ? <Pressable accessibilityRole="radio" accessibilityState={{ checked: selectedKeys.length === 0 }}
        onPress={() => { onSelect(''); setExpanded(false); }} style={styles.option}>
        <Text style={[styles.text, selectedKeys.length === 0 && styles.selected]}>{emptyLabel}</Text>
      </Pressable> : null}
      {options.map((option) => {
        const selected = selectedKeys.includes(option.key);
        return <Pressable key={option.key} accessibilityRole={multiple ? 'checkbox' : 'radio'}
          accessibilityState={{ checked: selected }} onPress={() => {
            onSelect(option.key);
            if (!multiple) setExpanded(false);
          }} style={styles.option}>
          <Text style={[styles.text, selected && styles.selected]}>{option.label}</Text>
          {selected ? <Text style={styles.selected}>Selected</Text> : null}
        </Pressable>;
      })}
      {!options.length ? <Text style={styles.empty}>{emptyMessage}</Text> : null}
    </ScrollView> : null}
  </View>;
}

const styles = StyleSheet.create({
  field: { marginBottom: 12 },
  label: { color: '#3A2E22', fontSize: 13, fontWeight: '700', marginBottom: 7 },
  trigger: { backgroundColor: '#fff', borderColor: '#E7DDCF', borderWidth: 1, borderRadius: 14, minHeight: 50,
    padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { color: '#3A2E22', fontSize: 14, flex: 1 },
  caret: { color: '#185A43', fontWeight: '700', fontSize: 13 },
  options: { maxHeight: 240, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E7DDCF', borderRadius: 12, marginTop: 4 },
  option: { minHeight: 48, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
    borderBottomColor: '#F1ECE6', borderBottomWidth: StyleSheet.hairlineWidth },
  selected: { color: '#185A43', fontWeight: '700' },
  empty: { color: '#756C61', padding: 14 },
});
