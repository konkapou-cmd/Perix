import type { TFunction } from "i18next";
import { CITY_GROUP_IDS, CITY_ROOT_IDS } from "../../i18n/city";
import { ACTIVITY_CATEGORIES, ACTIVITY_SUBCATEGORIES } from "../api/core";
import { MARKETPLACE_CATEGORIES } from "../marketplace/marketplaceTaxonomy";
import { SERVICE_MODULES } from "../config/serviceModules";
import { translateJobType } from "../categoryTranslation";
import type { GatewayNode } from "./gateway";

/** Localise presentation only; queries/IDs and the active map are unchanged. */
export function localizeGatewayNodes(nodes: GatewayNode[], t: TFunction, city: TFunction, root = ""): GatewayNode[] {
  return nodes.map(node => {
    const rootId = root || node.id;
    const rootIndex = CITY_ROOT_IDS.indexOf(node.id as typeof CITY_ROOT_IDS[number]);
    const groupIndex = CITY_GROUP_IDS.indexOf(node.id as typeof CITY_GROUP_IDS[number]);
    let label = node.label;
    if (!root && rootIndex >= 0) label = city(`roots.${rootIndex}`);
    else if (groupIndex >= 0) label = city(`groups.${groupIndex}`);
    else if (node.query.publicCategory) label = city(`leaves.${node.id.split(":").pop()}`, { defaultValue: label });
    else if (rootId === "events") label = t(`events.themes.${node.id}`, { defaultValue: label });
    else if (rootId === "activities") {
      const section = node.id in ACTIVITY_CATEGORIES ? "categories" : node.id in ACTIVITY_SUBCATEGORIES ? "subcategories" : "types";
      label = t(`activities.themes.${section}.${node.id}`, { defaultValue: label });
    } else if (rootId === "services") label = t(SERVICE_MODULES[node.id]?.labelKey || node.id, { defaultValue: label });
    else if (rootId === "jobs") label = translateJobType(node.id, t);
    else if (rootId === "products") {
      const category = MARKETPLACE_CATEGORIES.find(c => c.key === node.query.root);
      const key = category?.key === node.id ? category.labelKey : category?.subcategories.find(s => s.key === node.id)?.labelKey;
      if (key) label = t(key, { defaultValue: label });
    } else if (rootId === "mobility") label = t(node.id === "stop" ? "mobility.nearbyStops" : `mobility.${node.id}`, { defaultValue: label });
    return { ...node, label, children: node.children ? localizeGatewayNodes(node.children, t, city, rootId) : undefined };
  });
}

export function confirmedEmpty(state: { loading: boolean; error: string | null; partial: boolean; hasMore: boolean; items: unknown[] }): boolean {
  return !state.loading && !state.error && !state.partial && !state.hasMore && state.items.length === 0;
}
