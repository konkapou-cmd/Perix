import React from "react";
import { ActivityIndicator, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "../../context/AuthContext";
import { EntityKind } from "../../lib/city/gateway";
import { PublicEntityLoader } from "./CityInlineDetails";

export default function GuestEntityRoute({ kind, children }: { kind: EntityKind | "listing"; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  if (loading) return <ActivityIndicator />;
  if (user) return <>{children}</>;
  return <ScrollView contentContainerStyle={{ padding: 16 }}><PublicEntityLoader kind={kind === "listing" ? "product" : kind} id={id} /></ScrollView>;
}
