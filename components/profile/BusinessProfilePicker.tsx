import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import ProgressivePicker from "../navigation/ProgressivePicker";
import { TabDefinition, ProfileTab } from "./ProfileBase";

interface BusinessProfilePickerProps {
  activeTab: ProfileTab;
  onTabChange: (tab: ProfileTab) => void;
  tabs: TabDefinition[];
  primaryColor?: string;
  bgColor?: string;
  borderColor?: string;
}

export default function BusinessProfilePicker({
  activeTab,
  onTabChange,
  tabs,
  primaryColor,
  bgColor,
  borderColor,
}: BusinessProfilePickerProps) {
  const { t } = useTranslation();

  const serviceTabs = useMemo(
    () => tabs.filter((tab) => tab.key.startsWith("svc:")),
    [tabs]
  );
  const normalTabs = useMemo(
    () => tabs.filter((tab) => !tab.key.startsWith("svc:")),
    [tabs]
  );

  const hasServices = serviceTabs.length > 0;

  const currentPrimary = activeTab.startsWith("svc:") ? "services" : activeTab;

  const [lastServiceKey, setLastServiceKey] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab.startsWith("svc:")) {
      setLastServiceKey(activeTab);
    }
  }, [activeTab]);

  useEffect(() => {
    if (currentPrimary === "services" && !activeTab.startsWith("svc:") && serviceTabs.length > 0) {
      if (lastServiceKey && serviceTabs.some((s) => s.key === lastServiceKey)) {
        onTabChange(lastServiceKey);
      } else {
        onTabChange(serviceTabs[0].key);
      }
    }
  }, []);

  const primaryOptions = useMemo(() => {
    const result: { key: string; label: string; icon?: any; count?: number }[] = [];

    for (const tab of normalTabs) {
      result.push({
        key: tab.key,
        label: tab.label,
        icon: tab.icon as any,
        count: tab.count,
      });
    }

    if (hasServices && normalTabs.length > 0) {
      const nth = tabs.findIndex((tab) => tab.key.startsWith("svc:"));
      if (nth >= 0 && nth < result.length) {
        result.splice(nth, 0, {
          key: "services",
          label: t("navigation.services", "Dienstleistungen"),
          icon: "grid" as any,
          count: serviceTabs.length,
        });
      } else {
        result.push({
          key: "services",
          label: t("navigation.services", "Dienstleistungen"),
          icon: "grid" as any,
          count: serviceTabs.length,
        });
      }
    }

    return result;
  }, [normalTabs, hasServices, serviceTabs.length, tabs, t]);

  const handlePrimaryChange = (key: string) => {
    if (key === "services") {
      if (lastServiceKey && serviceTabs.some((s) => s.key === lastServiceKey)) {
        onTabChange(lastServiceKey);
      } else if (serviceTabs.length > 0) {
        onTabChange(serviceTabs[0].key);
      }
    } else {
      onTabChange(key);
    }
  };

  const validServiceTab = serviceTabs.some((s) => s.key === activeTab) ? activeTab : (serviceTabs[0]?.key ?? "");

  return (
    <>
      <ProgressivePicker
        label={t("navigation.section", "Bereich")}
        value={currentPrimary as ProfileTab}
        options={primaryOptions}
        onChange={(key) => handlePrimaryChange(key as string)}
        primaryColor={primaryColor}
        backgroundColor={bgColor}
        borderColor={borderColor}
      />
      {currentPrimary === "services" && serviceTabs.length > 1 && (
        <ProgressivePicker
          label={t("navigation.service", "Dienstleistung")}
          value={validServiceTab as ProfileTab}
          options={serviceTabs.map((tab) => ({
            key: tab.key,
            label: tab.label,
            icon: tab.icon as any,
            count: tab.count,
          }))}
          onChange={(key) => {
            setLastServiceKey(key);
            onTabChange(key);
          }}
          primaryColor={primaryColor}
          backgroundColor={bgColor}
          borderColor={borderColor}
        />
      )}
    </>
  );
}
