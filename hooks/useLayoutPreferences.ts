import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type SectionConfig = {
  id: string;
  title: string;
  enabled: boolean;
  order: number;
  layout: string;
  customStyle: Record<string, any>;
};

export type HomeLayoutConfig = {
  sections: SectionConfig[];
  favoriteCategories: string[];
  featuredContent: {
    enabled: boolean;
    type: "posts" | "events" | "activities" | "businesses" | "jobs" | "none";
    count: number;
  };
  sorting: {
    posts: "chronological" | "engagement" | "random" | "custom";
    events: "chronological" | "distance" | "engagement" | "random" | "custom";
    activities: "chronological" | "distance" | "engagement" | "random" | "custom";
    businesses: "chronological" | "distance" | "engagement" | "random" | "custom";
    jobs: "chronological" | "distance" | "random" | "custom";
    rentals: "chronological" | "distance" | "random" | "custom";
    services: "chronological" | "distance" | "engagement" | "random" | "custom";
  };
};

const DEFAULT_LAYOUT: HomeLayoutConfig = {
  sections: [
    { id: "map", title: "Locator Map", enabled: true, order: 1, layout: "map", customStyle: {} },
    { id: "events", title: "Events", enabled: true, order: 2, layout: "carousel", customStyle: {} },
    { id: "activities", title: "Activities", enabled: true, order: 3, layout: "carousel", customStyle: {} },
    { id: "businesses", title: "Businesses", enabled: true, order: 4, layout: "carousel", customStyle: {} },
    { id: "services", title: "Services", enabled: true, order: 5, layout: "carousel", customStyle: {} },
    { id: "rentals", title: "Rental & Real Estate", enabled: true, order: 6, layout: "carousel", customStyle: {} },
    { id: "jobs", title: "Jobs", enabled: true, order: 7, layout: "carousel", customStyle: {} },
    { id: "posts", title: "Latest Posts", enabled: true, order: 8, layout: "list", customStyle: {} },
  ],
  favoriteCategories: [],
  featuredContent: { enabled: false, type: "none", count: 3 },
  sorting: {
    posts: "chronological",
    events: "chronological",
    activities: "chronological",
    businesses: "chronological",
    jobs: "distance",
    rentals: "distance",
    services: "distance",
  },
};

const STORAGE_KEY = "homeLayout";

export function useLayoutPreferences() {
  const [homeLayout, setHomeLayout] = useState<HomeLayoutConfig>(DEFAULT_LAYOUT);
  const layoutLoaded = useRef(false);

  useEffect(() => {
    if (layoutLoaded.current) return;
    layoutLoaded.current = true;
    const load = async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          setHomeLayout(prev => ({
            ...prev,
            ...parsed,
            sections: prev.sections.map(s => {
              const savedSection = parsed.sections?.find((ps: SectionConfig) => ps.id === s.id);
              return savedSection ? { ...s, ...savedSection } : s;
            }),
          }));
        }
      } catch (e) {
        console.log("Error loading layout preferences:", e);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!layoutLoaded.current) return;
    const save = async () => {
      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(homeLayout));
      } catch (e) {
        console.log("Error saving layout preferences:", e);
      }
    };
    save();
  }, [homeLayout]);

  const toggleSection = useCallback((sectionId: string) => {
    setHomeLayout(prev => ({
      ...prev,
      sections: prev.sections.map(s =>
        s.id === sectionId ? { ...s, enabled: s.enabled === false ? true : false } : s
      ),
    }));
  }, []);

  const setSorting = useCallback((type: keyof HomeLayoutConfig["sorting"], value: string) => {
    setHomeLayout(prev => ({
      ...prev,
      sorting: { ...prev.sorting, [type]: value },
    }));
  }, []);

  const setFavoriteCategories = useCallback((categories: string[]) => {
    setHomeLayout(prev => ({ ...prev, favoriteCategories: categories }));
  }, []);

  return { homeLayout, setHomeLayout, toggleSection, setSorting, setFavoriteCategories };
}
