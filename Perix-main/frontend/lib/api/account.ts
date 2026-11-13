import { apiRequest } from "./core";

export type EntitlementActorType = "user" | "business";

export type EntitlementSnapshot = {
  policy_version: string;
  enforcement_mode: string;
  actor_type: EntitlementActorType;
  actor_id: string;
  period_key?: string | null;
  period_zone?: string | null;
  effective_plan?: string | null;
  subscription_status?: string | null;
  founder_active: boolean;
  founder_until?: string | null;
  limits: Record<string, number | null>;
  usage: Record<string, number>;
  remaining: Record<string, number | null | boolean>;
  next_reset_at?: string | null;
  reason_codes: string[];
  /** v19: Business plan grant from a redeemed Pro100 code. */
  business_plan_grant?: string | null;
  /** v19: last redeemed code (User100 / Pro100) with the 2-day profile deadline. */
  redemption?: {
    code: string;
    plan: string;
    redeemed_at: string | null;
    profile_complete_deadline: string | null;
    reverted: boolean;
  } | null;
};

export type RedeemResult = {
  ok: boolean;
  error?: string | null;
  plan?: string | null;
  code?: string | null;
  profile_complete_deadline?: string | null;
  message: string;
};

export async function fetchEntitlements(
  sessionToken: string,
  actorType: EntitlementActorType = "user",
  actorId?: string,
): Promise<EntitlementSnapshot> {
  const query =
    actorType === "business" && actorId
      ? `?actor_type=business&actor_id=${encodeURIComponent(actorId)}`
      : "?actor_type=user";
  return apiRequest<EntitlementSnapshot>(
    `/account/entitlements${query}`,
    "GET",
    sessionToken,
  );
}

/**
 * Interim access without payment: redeem a distributed code.
 * "User100" -> Premium, "Pro100" -> Business (first 100 uses each).
 */
export async function redeemCode(
  sessionToken: string,
  code: string,
): Promise<RedeemResult> {
  return apiRequest<RedeemResult>("/account/redeem", "POST", sessionToken, { code });
}

/**
 * Resend the email confirmation link (opens a fresh 6-hour window).
 */
export async function resendVerification(
  sessionToken: string,
): Promise<{ status: string }> {
  return apiRequest<{ status: string }>("/auth/resend-verification", "POST", sessionToken, {});
}
