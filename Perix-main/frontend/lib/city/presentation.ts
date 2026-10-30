import { COLORS } from "../designTokens";
import type { DirectoryEntity, GatewayNode } from "./gateway";

// Reuse the Locator/BusinessMap's existing semantic pin colours, never recolour
// the shared renderer or global design tokens to match the public homepage.
export const GATEWAY_ENTITY_COLORS: Record<string, string> = {
  business: COLORS.pinBusiness,
  event: COLORS.pinEvent,
  activity: COLORS.pinActivity,
  hotel: COLORS.pinHotel,
  job: COLORS.pinJob,
  rental: COLORS.pinRental,
  product: COLORS.pinProduct,
  home: COLORS.pinHome,
  service: COLORS.pinService,
  post: COLORS.postsAccent,
  public_service: "#064472",
  bus: "#216BA2", tram: "#26945E", taxi: "#B19165", stop: "#064472",
};

export function gatewayEntityColor(entity: DirectoryEntity): string {
  if (entity.type === "business" && entity.category_ids?.includes("local-hotels")) return COLORS.pinHotel;
  return GATEWAY_ENTITY_COLORS[entity.type] || COLORS.pinBusiness;
}

export function gatewayNodeColor(node: GatewayNode): string {
  if (node.query.publicCategory?.startsWith("ps:sos")) return COLORS.danger;
  if (node.query.root === "local-hotels") return COLORS.pinHotel;
  if (node.query.mobilityOnly) return GATEWAY_ENTITY_COLORS[node.query.mobilityMode || "bus"] || COLORS.primary;
  if (node.action === "login") return COLORS.primary;
  return GATEWAY_ENTITY_COLORS[node.query.kinds[0]] || GATEWAY_ENTITY_COLORS.public_service;
}
