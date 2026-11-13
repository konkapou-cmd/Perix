import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { getPublicService, PublicService } from "../../lib/city/publicServices";
import { PublicServiceCard } from "../../components/city/PublicServiceCard";
import MapScreenHeader from "../../components/city/MapScreenHeader";
import AppBottomNavigation from "../../components/navigation/AppBottomNavigation";
import { useTranslation } from "react-i18next";
import "../../i18n/city";

export default function PublicServicePage() {
  const { t } = useTranslation("city");
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [service, setService] = useState<PublicService | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setService(null); setError(false);
    getPublicService(id).then(result => { if (active) setService(result); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [id, retry]);
  return <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }} edges={["top"]}>
    <MapScreenHeader logoVariant="english" onBack={() => (router.canGoBack() ? router.back() : router.navigate("/app" as never))} />
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
      {service ? <PublicServiceCard service={service} full /> : error ? <>
        <Text>{t("ui.unavailable")}</Text>
        <Pressable accessibilityRole="button" style={{ minHeight: 44, padding: 12 }} onPress={() => setRetry(n => n + 1)}><Text>{t("ui.retry")}</Text></Pressable>
      </> : <ActivityIndicator accessibilityLabel={t("ui.loading")} />}
    </ScrollView>
    <AppBottomNavigation />
  </SafeAreaView>;
}
