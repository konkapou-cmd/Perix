import React, { useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../lib/designTokens";

interface SearchItem {
  id: string;
  name: string;
  logo?: string | null;
}

interface Props<T extends SearchItem> {
  items: T[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  placeholder?: string;
  label?: string;
  noneLabel?: string;
}

export default function DropdownSearch<T extends SearchItem>({
  items,
  selectedId,
  onSelect,
  placeholder = "Search...",
  label,
  noneLabel = "None",
}: Props<T>) {
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState("");
  const selected = items.find((item) => item.id === selectedId);

  const filtered = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      {label && <Text style={styles.label}>{label}</Text>}
      <Pressable style={styles.trigger} onPress={() => setVisible(true)}>
        <View style={styles.triggerContent}>
          {selected?.logo ? (
            <View style={styles.logoPlaceholder}>
              <Text style={styles.logoText}>B</Text>
            </View>
          ) : selected ? (
            <Ionicons name="business" size={16} color={COLORS.primaryDark} />
          ) : (
            <Ionicons name="add-circle-outline" size={16} color="#6b7280" />
          )}
          <Text style={[styles.triggerText, !selected && styles.triggerPlaceholder]}>
            {selected?.name || placeholder}
          </Text>
        </View>
        <Ionicons name="chevron-down" size={18} color="#6b7280" />
      </Pressable>

      <Modal visible={visible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{label || "Select"}</Text>
              <Pressable onPress={() => setVisible(false)}>
                <Ionicons name="close" size={22} color={COLORS.textPrimary} />
              </Pressable>
            </View>

            <TextInput
              style={styles.searchInput}
              placeholder="Search..."
              value={search}
              onChangeText={setSearch}
              autoFocus
            />

            <ScrollView style={styles.list}>
              <Pressable
                style={styles.item}
                onPress={() => {
                  onSelect(null);
                  setVisible(false);
                  setSearch("");
                }}
              >
                <Ionicons name="close-circle-outline" size={20} color="#6b7280" />
                <Text style={styles.itemText}>{noneLabel}</Text>
              </Pressable>

              {filtered.map((item) => (
                <Pressable
                  key={item.id}
                  style={[styles.item, selectedId === item.id && styles.itemSelected]}
                  onPress={() => {
                    onSelect(item.id);
                    setVisible(false);
                    setSearch("");
                  }}
                >
                  {item.logo ? (
                    <View style={styles.itemLogo}>
                      <Text style={styles.logoTextSmall}>B</Text>
                    </View>
                  ) : (
                    <Ionicons name="business" size={20} color={COLORS.primaryDark} />
                  )}
                  <Text style={[styles.itemText, selectedId === item.id && styles.itemTextSelected]}>
                    {item.name}
                  </Text>
                  {selectedId === item.id && (
                    <Ionicons name="checkmark" size={20} color={COLORS.primaryDark} />
                  )}
                </Pressable>
              ))}

              {filtered.length === 0 && (
                <Text style={styles.emptyText}>No results found</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  triggerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  logoPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.primaryDark,
  },
  logoTextSmall: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.primaryDark,
  },
  triggerText: {
    fontSize: 15,
    color: COLORS.textPrimary,
    flex: 1,
  },
  triggerPlaceholder: {
    color: "#9ca3af",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "80%",
    paddingBottom: 34,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  searchInput: {
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginVertical: 12,
    fontSize: 15,
  },
  list: {
    maxHeight: 400,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  itemSelected: {
    backgroundColor: COLORS.primaryLight,
  },
  itemLogo: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  itemText: {
    fontSize: 15,
    color: COLORS.textPrimary,
    flex: 1,
  },
  itemTextSelected: {
    fontWeight: "600",
    color: COLORS.primaryDark,
  },
  emptyText: {
    textAlign: "center",
    color: "#9ca3af",
    paddingVertical: 20,
  },
});