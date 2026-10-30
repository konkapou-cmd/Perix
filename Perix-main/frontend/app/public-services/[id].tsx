import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { getPublicService, PublicService } from "../../lib/city/publicServices";
import { PublicServiceCard } from "../../components/city/PublicServiceCard";
import { useTranslation } from "react-i18next";
import "../../i18n/city";

export default function PublicServicePage() {
  const { t } = useTranslation("city");
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
  return <ScrollView contentContainerStyle={{ padding: 16 }}>
    {service ? <PublicServiceCard service={service} full /> : error ? <>
      <Text>{t("ui.unavailable")}</Text>
      <Pressable accessibilityRole="button" style={{ minHeight: 44, padding: 12 }} onPress={() => setRetry(n => n + 1)}><Text>{t("ui.retry")}</Text></Pressable>
    </> : <ActivityIndicator accessibilityLabel={t("ui.loading")} />}
  </ScrollView>;
}
