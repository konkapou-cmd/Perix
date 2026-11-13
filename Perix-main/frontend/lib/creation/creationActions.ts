import type { EntitlementSnapshot } from "../api/account";

export type CreationActor = "user" | "business";

export type ReasonCode =
  | "plan_required"
  | "quota_reached"
  | "category_not_allowed"
  | "business_required"
  | "artist_deprecated"
  | "not_applicable";

export type CreationActionKey =
  | "post"
  | "activity"
  | "classified_ad"
  | "product"
  | "home_rental"
  | "service"
  | "event"
  | "job";

export type ResolvedCreationAction = {
  key: CreationActionKey;
  allowed: boolean;
  reasonCode: ReasonCode | null;
  /** Free users publish "product" as a classified ad (decision D02). */
  kindOverride?: CreationActionKey | null;
  labelKey: string;
  reasonLabelKey?: string;
};

export const REASON_LABELS: Record<ReasonCode, string> = {
  plan_required: "creation.reason.planRequired",
  quota_reached: "creation.reason.quotaReached",
  category_not_allowed: "creation.reason.categoryNotAllowed",
  business_required: "creation.reason.businessRequired",
  artist_deprecated: "creation.reason.artistDeprecated",
  not_applicable: "creation.reason.notApplicable",
};

const USER_ACTION_KEYS: CreationActionKey[] = ["post", "activity", "product", "home_rental"];
const BUSINESS_ACTION_KEYS: CreationActionKey[] = ["product", "service", "event", "job"];

function allowed(key: CreationActionKey, labelKey: string): ResolvedCreationAction {
  return { key, allowed: true, reasonCode: null, labelKey };
}

function locked(
  key: CreationActionKey,
  reasonCode: ReasonCode,
  labelKey: string,
): ResolvedCreationAction {
  return { key, allowed: false, reasonCode, labelKey, reasonLabelKey: REASON_LABELS[reasonCode] };
}

/**
 * Server-authoritative creation actions per verified actor (decision v18).
 *
 * The optional entitlement snapshot (GET /api/account/entitlements) refines
 * plan-specific behavior. When it is missing, defaults are used so existing
 * callers keep working; the backend still enforces ownership and limits.
 */
export function resolveCreationActions(
  actorType: CreationActor,
  entitlements?: EntitlementSnapshot | null,
): ResolvedCreationAction[] {
  if (actorType === "user") {
    const plan = entitlements?.effective_plan ?? "free_user";
    return USER_ACTION_KEYS.map((key) => {
      if (key === "post") {
        return allowed("post", "creation.camera");
      }
      if (key === "product") {
        if (plan === "free_user") {
          return {
            key: "product",
            allowed: true,
            reasonCode: null,
            kindOverride: "classified_ad",
            labelKey: "creation.classifiedAd",
          };
        }
        return allowed("product", "creation.product");
      }
      if (key === "activity") {
        if (plan !== "premium_user") {
          return locked("activity", "plan_required", "creation.activity");
        }
        return allowed("activity", "creation.activity");
      }
      if (key === "home_rental") {
        if (plan !== "premium_user") {
          return locked("home_rental", "plan_required", "creation.homeRental");
        }
        return allowed("home_rental", "creation.homeRental");
      }
      return allowed(key, key);
    });
  }

  // Business actor: existing professional flows. Quota usage counters arrive
  // in phase 3; until then actions are allowed and the backend enforces.
  return BUSINESS_ACTION_KEYS.map((key) => {
    switch (key) {
      case "product":
        return allowed("product", "marketplace.addProduct");
      case "service":
        return allowed("service", "services.addService");
      case "event":
        return allowed("event", "business.createEvent");
      case "job":
        return allowed("job", "business.createJob");
      default:
        return allowed(key, key);
    }
  });
}

/** The separate artist identity is deprecated (decision D13). */
export function isArtistDeprecated(actorType: string | undefined): boolean {
  return actorType === "artist";
}
