import { Linking, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

export type MobilityServiceWarning = {
  route_number: string; mode?: string; status: string;
  message?: string; source_url?: string; notice_id?: string;
};

export default function MobilityServiceWarnings({ warnings }: { warnings: MobilityServiceWarning[] }) {
  const { t } = useTranslation();
  if (!warnings.length) return null;
  const notices = warnings.filter(w => w.status === "OPERATOR_DIVERSION_NOT_IN_TIMETABLE"
    || w.status === "OPERATOR_NOTICE_REVIEW_REQUIRED");
  const other = warnings.filter(w => !notices.includes(w));
  const uniqueNotices = notices.filter((w, i) => notices.findIndex(x =>
    (x.notice_id || x.route_number) === (w.notice_id || w.route_number)) === i);
  return <View style={{ padding: 9, borderRadius: 9, backgroundColor: "#EDF4FB", marginBottom: 8 }}>
    {other.length > 0 ? <Text style={{ color: "#264348", fontSize: 12, fontWeight: "600" }}>
      {t("mobility.detourPending", "Umleitung wird geprüft: {{lines}}", {
        lines: [...new Set(other.map(w => w.route_number))].join(", "),
      })}
    </Text> : null}
    {uniqueNotices.map(w => <View key={`${w.notice_id}:${w.route_number}`}>
      <Text style={{ color: "#264348", fontSize: 12, fontWeight: "600" }}>
        {t("mobility.operatorTimetableConflict", "{{line}}: operator diversion is not reflected in the timetable. Map positions and times may be inaccurate.", {
          line: [...new Set(notices.filter(x => (x.notice_id || x.route_number) === (w.notice_id || w.route_number))
            .map(x => x.route_number))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(", "),
        })}
      </Text>
      {w.message ? <Text style={{ color: "#264348", fontSize: 12, marginTop: 4 }}>{w.message}</Text> : null}
      {w.source_url?.startsWith("https://") ? <Pressable accessibilityRole="link"
        onPress={() => { Linking.openURL(w.source_url!).catch(() => {}); }} style={{ paddingVertical: 8 }}>
        <Text style={{ color: "#096BFF", fontSize: 12 }}>{t("mobility.operatorNotice", "Operator notice")}</Text>
      </Pressable> : null}
    </View>)}
  </View>;
}
