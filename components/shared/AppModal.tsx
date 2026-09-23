import React from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, BORDER_RADIUS, SPACING, FONT_SIZES, FONT_WEIGHTS } from "../../lib/designTokens";

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  headerStyle?: ViewStyle;
  bodyStyle?: ViewStyle;
};

export const AppModal = ({
  visible,
  onClose,
  title,
  children,
  footer,
  headerStyle,
  bodyStyle,
}: Props) => {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={s.container} edges={["top"]}>
        <KeyboardAvoidingView
          style={s.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[s.header, headerStyle]}>
            <Pressable onPress={onClose} style={s.headerBtn}>
              <Ionicons name="close" size={22} color={COLORS.textPrimary} />
            </Pressable>
            {title != null && <Text style={s.title}>{title}</Text>}
            <View style={s.headerPlaceholder} />
          </View>

          <ScrollView
            style={s.flex}
            contentContainerStyle={[s.body, bodyStyle]}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>

          {footer != null && <View style={s.footer}>{footer}</View>}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const s = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundPage,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.std,
    paddingVertical: SPACING.compact,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerPlaceholder: {
    width: 36,
  },
  title: {
    fontSize: FONT_SIZES.h3,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
    textAlign: "center",
  },
  body: {
    padding: SPACING.std,
    paddingBottom: SPACING.large,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: SPACING.std,
    paddingVertical: SPACING.compact,
    backgroundColor: COLORS.background,
    flexDirection: "row",
    gap: SPACING.small,
  },
});

export default AppModal;
