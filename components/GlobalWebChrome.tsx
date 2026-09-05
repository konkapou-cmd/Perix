import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Platform, Alert } from "react-native";
import { useRouter, useSegments } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { CreateFlowContext } from "../context/CreateFlowContext";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import TopNavbar from "./TopNavbar";
import BusinessActionsModal, { BusinessAction } from "./business/BusinessActionsModal";
import CreationSheet, { CreationAction } from "./user/CreationSheet";
import ListingModal from "./user/ListingModal";
import type { ListingType } from "../lib/api/listings";
import { entityRoutes, pushEntityRoute, showInvalidEntityAlert } from "../lib/navigation/entityRoutes";
import { getProductPermissions, getManageListings } from "../lib/api/listings";

export default function GlobalWebChrome({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const segments = useSegments();
  const { isDesktop } = useResponsiveLayout();
  const { activeIdentity, sessionToken } = useAuth();

  const [showBizActions, setShowBizActions] = useState(false);
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [listingType, setListingType] = useState<ListingType | null>(null);
  const isBusiness = activeIdentity?.type === "business";

  const [bizActionsLoading, setBizActionsLoading] = useState(false);
  const [bizActionsProductsEnabled, setBizActionsProductsEnabled] = useState(false);
  const [bizActionsListingsCount, setBizActionsListingsCount] = useState(0);
  const bizActionsRequestRef = useRef(0);

  useEffect(() => {
    if (!showBizActions || !activeIdentity?.id || !sessionToken) return;
    const requestId = ++bizActionsRequestRef.current;
    setBizActionsLoading(true);
    Promise.allSettled([
      getProductPermissions(activeIdentity.id),
      getManageListings(sessionToken, "business", activeIdentity.id),
    ]).then(([permsResult, listingsResult]) => {
      if (requestId !== bizActionsRequestRef.current) return;
      if (permsResult.status === "fulfilled") {
        setBizActionsProductsEnabled(permsResult.value.enabled);
      } else {
        setBizActionsProductsEnabled(false);
      }
      if (listingsResult.status === "fulfilled") {
        setBizActionsListingsCount(
          listingsResult.value.filter((l) => l.listing_type === "product").length,
        );
      } else {
        setBizActionsListingsCount(0);
      }
      setBizActionsLoading(false);
    });
  }, [showBizActions, activeIdentity?.id, sessionToken]);

  const handleBizAction = (action: BusinessAction) => {
    switch (action) {
      case "create-product":
        router.replace({ pathname: "/(tabs)/profile", params: { openProduct: "1" } });
        break;
      case "create-service":
        router.replace({ pathname: "/(tabs)/profile", params: { openService: "1" } });
        break;
      case "create-event":
        router.replace({ pathname: "/(tabs)/profile", params: { openEvent: "1" } });
        break;
      case "create-job":
        router.replace({ pathname: "/(tabs)/profile", params: { openJob: "1" } });
        break;
      case "manage-products":
        router.replace({ pathname: "/(tabs)/profile", params: { section: "items" } });
        break;
      case "manage-services":
        router.replace({ pathname: "/(tabs)/profile", params: { section: "services" } });
        break;
      case "manage-events":
        router.replace({ pathname: "/(tabs)/profile", params: { section: "events" } });
        break;
      case "manage-jobs":
        router.replace({ pathname: "/(tabs)/profile", params: { section: "jobs" } });
        break;
      case "manage-bookings":
        router.replace({ pathname: "/(tabs)/profile", params: { openBookings: "1" } });
        break;
      case "manage-media":
        router.replace({ pathname: "/(tabs)/profile", params: { section: "media" } });
        break;
    }
  };

  const handleCreateAction = (action: CreationAction) => {
    switch (action) {
      case "camera":
        router.push("/camera");
        break;
      case "activity":
        router.replace({ pathname: "/(tabs)/profile", params: { openActivity: "1" } as any });
        break;
      case "home_rental":
      case "product":
        if (!sessionToken) {
          router.push("/login" as any);
          return;
        }
        setListingType(action as ListingType);
        break;
    }
  };

  const showTopNavbar = isDesktop && Platform.OS === "web" && segments[0] !== "(auth)";

  const createFlowValue = useMemo(
    () => ({
      openCreateSheet: () => setShowCreateSheet(true),
      openBizActions: () => setShowBizActions(true),
    }),
    [],
  );

  return (
    <CreateFlowContext.Provider value={createFlowValue}>
      <View style={{ flex: 1 }}>
        {showTopNavbar && (
          <TopNavbar
            onCreatePress={() => (isBusiness ? setShowBizActions(true) : setShowCreateSheet(true))}
          />
        )}
        <View style={{ flex: 1 }}>{children}</View>

        <BusinessActionsModal
          visible={showBizActions}
          loading={bizActionsLoading}
          businessProductsEnabled={bizActionsProductsEnabled}
          listingsCount={bizActionsListingsCount}
          onClose={() => setShowBizActions(false)}
          onAction={handleBizAction}
        />
        <CreationSheet
          visible={showCreateSheet}
          onClose={() => setShowCreateSheet(false)}
          onAction={handleCreateAction}
        />
        <ListingModal
          visible={listingType !== null}
          listingType={listingType ?? "product"}
          sessionToken={sessionToken ?? ""}
          onClose={() => setListingType(null)}
          onSave={() => setListingType(null)}
          onCreated={(listingId) => {
            setListingType(null);
            Alert.alert(
              t("common.success", "Erfolgreich"),
              t("marketplace.itemCreated", "Dein Eintrag wurde veröffentlicht."),
              [
                {
                  text: t("marketplace.viewListing", "Ansehen"),
                  onPress: () => pushEntityRoute(router, entityRoutes.listing(listingId), () => showInvalidEntityAlert(t)),
                },
                {
                  text: t("marketplace.myListings", "Meine Einträge"),
                  onPress: () => router.push("/my-listings" as any),
                },
                { text: t("common.ok", "OK"), onPress: () => {} },
              ],
            );
          }}
        />
      </View>
    </CreateFlowContext.Provider>
  );
}
