import { apiRequest } from "./core";
export type {
  SubscriptionPlan, VoucherInfo, PromoterInfo, CheckoutResult, CheckoutStatus, AdminPromoter, PaymentTransaction,
  VoucherResponse, VoucherCheckResponse,
} from "./core";

export const getSubscriptionPlans = async (token: string): Promise<import("./core").SubscriptionPlans> => {
  return apiRequest<import("./core").SubscriptionPlans>("/subscriptions/plans", "GET", token);
};

export const createSubscription = async (
  token: string,
  payload: { business_id: string; plan_type: string }
): Promise<import("./core").SubscriptionResponse> => {
  return apiRequest<import("./core").SubscriptionResponse>("/subscriptions/create", "POST", token, payload);
};

export const getSubscriptionStatus = async (token: string, subscriptionId: string): Promise<{ status: string }> => {
  return apiRequest<{ status: string }>(`/subscriptions/status/${subscriptionId}`, "GET", token);
};

export const applyVoucher = async (
  token: string,
  voucherCode: string,
  businessId: string
): Promise<import("./core").VoucherResponse> => {
  return apiRequest<import("./core").VoucherResponse>("/subscriptions/voucher/apply", "POST", token, {
    voucher_code: voucherCode,
    business_id: businessId,
  });
};

export const checkVoucher = async (voucherCode: string): Promise<import("./core").VoucherCheckResponse> => {
  return apiRequest<import("./core").VoucherCheckResponse>(`/subscriptions/voucher/check/${encodeURIComponent(voucherCode)}`, "GET");
};

export const getStripeSubscriptionPlans = async (): Promise<{ plans: import("./core").SubscriptionPlan[]; voucher_available: boolean }> => {
  return apiRequest("/stripe/plans", "GET");
};

export const validateVoucher = async (code: string): Promise<import("./core").VoucherInfo> => {
  return apiRequest<import("./core").VoucherInfo>(`/stripe/voucher/check/${encodeURIComponent(code)}`, "GET");
};

export const validatePromoterCode = async (code: string): Promise<{ valid: boolean; promoter_name?: string; message: string }> => {
  return apiRequest(`/stripe/promoters/validate/${encodeURIComponent(code)}`, "GET");
};

export const createSubscriptionCheckout = async (
  token: string,
  businessId: string,
  planType: "monthly" | "yearly",
  originUrl: string,
  voucherCode?: string,
  promoterCode?: string
): Promise<import("./core").CheckoutResult> => {
  return apiRequest<import("./core").CheckoutResult>("/stripe/checkout/create", "POST", token, {
    business_id: businessId,
    plan_type: planType,
    voucher_code: voucherCode,
    promoter_code: promoterCode,
    origin_url: originUrl,
  });
};

export const getCheckoutStatus = async (token: string, sessionId: string): Promise<import("./core").CheckoutStatus> => {
  return apiRequest<import("./core").CheckoutStatus>(`/stripe/checkout/status/${sessionId}`, "GET", token);
};

export const registerAsPromoter = async (
  token: string,
  data: { name: string; email: string; phone?: string; bank_details?: string }
): Promise<import("./core").PromoterInfo> => {
  return apiRequest<import("./core").PromoterInfo>("/stripe/promoters/register", "POST", token, data);
};

export const getPromoterProfile = async (token: string): Promise<import("./core").PromoterInfo & { recent_referrals: any[] }> => {
  return apiRequest("/stripe/promoters/me", "GET", token);
};

export const applyFreeMonthsVoucher = async (
  token: string,
  businessId: string,
  voucherCode: string
): Promise<{ success: boolean; message: string; expires_at: string }> => {
  return apiRequest(`/stripe/voucher/apply?business_id=${businessId}&voucher_code=${encodeURIComponent(voucherCode)}`, "POST", token);
};

export const getAdminPromoters = async (token: string): Promise<{ promoters: import("./core").AdminPromoter[] }> => {
  return apiRequest("/stripe/admin/promoters", "GET", token);
};

export const processPromoterPayout = async (
  token: string,
  promoterId: string,
  amount: number
): Promise<{ success: boolean; payout_id: string; amount: number; new_pending_balance: number }> => {
  return apiRequest(`/stripe/admin/promoters/${promoterId}/payout?amount=${amount}`, "POST", token);
};

export const getAdminPaymentTransactions = async (token: string): Promise<{ transactions: import("./core").PaymentTransaction[] }> => {
  return apiRequest("/stripe/admin/transactions", "GET", token);
};
