import { useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { apiRequest } from "../lib/api/core";

type Props = {
  visible: boolean;
  targetType: string; // "post" | "comment" | "event" | "activity" | "job" | "service" | "listing" | "story" | "user" | "business"
  targetId: string;
  sessionToken?: string | null;
  onClose: () => void;
  onSubmitted?: () => void;
};

const REASONS = [
  { key: "spam", icon: "mail-unread-outline" as const },
  { key: "inappropriate", icon: "eye-off-outline" as const },
  { key: "harassment", icon: "hand-left-outline" as const },
  { key: "false_information", icon: "alert-circle-outline" as const },
  { key: "other", icon: "ellipsis-horizontal" as const },
];

export default function ReportModal({ visible, targetType, targetId, sessionToken, onClose, onSubmitted }: Props) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("spam");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!sessionToken) {
      setError(t("report.loginRequired", "Please log in to report content."));
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await apiRequest("/reports/content", "POST", sessionToken, {
        target_type: targetType,
        target_id: targetId,
        reason: `${reason}${details.trim() ? `: ${details.trim()}` : ""}`,
      });
      setDone(true);
      onSubmitted?.();
    } catch (e: any) {
      setError(e?.message || t("report.failed", "Failed to submit report"));
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => {
    setDone(false);
    setDetails("");
    setReason("spam");
    setError("");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.overlay} onPress={close}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>{t("report.title", "Report content")}</Text>
            <Pressable onPress={close} hitSlop={10}>
              <Ionicons name="close" size={22} color="#264348" />
            </Pressable>
          </View>

          {done ? (
            <View style={styles.doneWrap}>
              <Ionicons name="checkmark-circle" size={52} color="#10b981" />
              <Text style={styles.doneText}>{t("report.thanks", "Thank you. Our team will review this report.")}</Text>
              <Pressable style={[styles.submitBtn, styles.okBtn]} onPress={close}>
                <Text style={[styles.submitText, styles.okText]}>{t("common.ok", "OK")}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.label}>{t("report.reason", "Why are you reporting this?")}</Text>
              {REASONS.map((r) => (
                <Pressable
                  key={r.key}
                  style={[styles.reasonRow, reason === r.key && styles.reasonRowActive]}
                  onPress={() => setReason(r.key)}
                >
                  <Ionicons name={r.icon} size={18} color={reason === r.key ? "#59ABE3" : "#264348"} />
                  <Text style={[styles.reasonText, reason === r.key && styles.reasonTextActive]}>
                    {t(`report.reasons.${r.key}`, r.key === "spam" ? "Spam" : r.key === "inappropriate" ? "Inappropriate content" : r.key === "harassment" ? "Harassment" : r.key === "false_information" ? "False information" : "Other")}
                  </Text>
                  {reason === r.key && <Ionicons name="checkmark" size={18} color="#59ABE3" />}
                </Pressable>
              ))}
              <TextInput
                style={styles.input}
                value={details}
                onChangeText={setDetails}
                placeholder={t("report.details", "Additional details (optional)")}
                placeholderTextColor="#9ca3af"
                multiline
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={submit} disabled={submitting}>
                <Text style={styles.submitText}>{t("report.submit", "Submit report")}</Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#264348",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#264348",
    marginBottom: 8,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 8,
  },
  reasonRowActive: {
    borderColor: "#59ABE3",
    backgroundColor: "rgba(89,171,227,0.08)",
  },
  reasonText: {
    flex: 1,
    fontSize: 14,
    color: "#264348",
  },
  reasonTextActive: {
    fontWeight: "600",
    color: "#59ABE3",
  },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    minHeight: 70,
    fontSize: 14,
    color: "#264348",
    textAlignVertical: "top",
  },
  submitBtn: {
    marginTop: 14,
    backgroundColor: "#59ABE3",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  submitText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  error: {
    color: "#ef4444",
    marginTop: 10,
    fontSize: 13,
  },
  doneWrap: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
  },
  doneText: {
    fontSize: 14,
    color: "#264348",
    textAlign: "center",
  },
  okBtn: {
    marginTop: 14,
    paddingVertical: 15,
  },
  okText: {
    fontSize: 16,
  },
});
