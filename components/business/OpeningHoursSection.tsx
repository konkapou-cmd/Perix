import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type DayHours = {
  enabled: boolean;
  periods: { open: string; close: string }[];
};

type Props = {
  schedule: Record<string, DayHours>;
  onEdit: () => void;
};

export default function OpeningHoursSection({ schedule, onEdit }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <View style={styles.sectionHeader}>
        <Text style={styles.cardTitle}>{t("business.openingHours")}</Text>
        <Pressable style={styles.secondaryButton} onPress={onEdit}>
          <Text style={styles.secondaryButtonText}>{t("business.editHours")}</Text>
        </Pressable>
      </View>
      {DAYS.map((day) => {
        const dayData = schedule[day];
        const translatedDay = t(`days.${day.toLowerCase()}`);
        return (
          <View key={day} style={styles.hoursRow}>
            <Text style={[styles.dayLabel, !dayData?.enabled && styles.dayLabelClosed]}>
              {translatedDay.substring(0, 3)}
            </Text>
            <Text style={[styles.hoursText, !dayData?.enabled && styles.hoursTextClosed]}>
              {dayData?.enabled
                ? dayData.periods.map((p) => `${p.open}-${p.close}`).join(", ")
                : t("business.closed")}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontWeight: "600",
    color: "#111827",
    marginBottom: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#000000",
    fontWeight: "600",
    fontSize: 13,
  },
  hoursRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  dayLabel: {
    width: 40,
    fontWeight: "600",
    color: "#111827",
    fontSize: 13,
  },
  dayLabelClosed: {
    color: "#9ca3af",
  },
  hoursText: {
    flex: 1,
    color: "#10b981",
    fontSize: 13,
  },
  hoursTextClosed: {
    color: "#ef4444",
  },
});
