import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function toDateKey(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDateKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function CalendarPicker({
  value,
  onChange,
  minDate,
}: {
  value: string;
  onChange: (dateKey: string) => void;
  minDate: Date;
}) {
  const initial = value ? parseDateKey(value) : minDate;
  const [view, setView] = useState({ year: initial.getFullYear(), month: initial.getMonth() });
  const minKey = toDateKey(minDate);
  const firstWeekday = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const canGoBack = view.year > minDate.getFullYear() ||
    (view.year === minDate.getFullYear() && view.month > minDate.getMonth());

  function shift(delta: number) {
    const next = new Date(view.year, view.month + delta, 1);
    setView({ year: next.getFullYear(), month: next.getMonth() });
  }

  return (
    <View style={styles.wrap} accessibilityLabel="Service date calendar">
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          disabled={!canGoBack}
          onPress={() => shift(-1)}
          style={styles.nav}
        >
          <Text style={[styles.navText, !canGoBack && styles.navDisabled]}>‹</Text>
        </Pressable>
        <Text style={styles.month}>{monthNames[view.month]} {view.year}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => shift(1)} style={styles.nav}>
          <Text style={styles.navText}>›</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        {weekdays.map((day) => <Text key={day} style={styles.weekday}>{day}</Text>)}
      </View>
      <View style={styles.grid}>
        {cells.map((day, index) => {
          if (day === null) return <View key={`blank-${index}`} style={styles.cell} />;
          const key = toDateKey(new Date(view.year, view.month, day));
          const disabled = key < minKey;
          const selected = key === value;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={key}
              accessibilityState={{ disabled, selected }}
              disabled={disabled}
              onPress={() => onChange(key)}
              style={styles.cell}
            >
              <View style={[styles.day, selected && styles.daySelected]}>
                <Text style={[styles.dayText, disabled && styles.dayDisabled, selected && styles.dayTextSelected]}>
                  {day}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: '#fff', borderColor: '#E7DDCF', borderRadius: 14, borderWidth: 1, padding: 10 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  nav: { paddingHorizontal: 14, paddingVertical: 4 },
  navText: { color: '#185A43', fontSize: 22, fontWeight: '800' },
  navDisabled: { color: '#CFC7BC' },
  month: { color: '#3A2E22', fontSize: 15, fontWeight: '800' },
  row: { flexDirection: 'row' },
  weekday: { color: '#756C61', flex: 1, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { alignItems: 'center', height: 40, justifyContent: 'center', width: '14.2857%' },
  day: { alignItems: 'center', borderRadius: 18, height: 34, justifyContent: 'center', width: 34 },
  daySelected: { backgroundColor: '#185A43' },
  dayText: { color: '#3A2E22', fontSize: 14 },
  dayDisabled: { color: '#CFC7BC' },
  dayTextSelected: { color: '#fff', fontWeight: '800' },
});
