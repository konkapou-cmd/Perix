import { apiRequest } from "./core";
export type { CheckContactsResponse, MatchedContact, InvitableContact } from "./core";

export const checkContacts = async (
  token: string,
  contacts: { name: string; phone_numbers: string[] }[]
): Promise<import("./core").CheckContactsResponse> => {
  return apiRequest<import("./core").CheckContactsResponse>("/contacts/check", "POST", token, { contacts });
};

export const trackInvite = async (
  token: string,
  phoneNumber: string,
  inviteMethod: "sms" | "whatsapp" | "other"
): Promise<{ success: boolean; message: string; new_invite: boolean }> => {
  return apiRequest(
    `/contacts/invite-tracking?phone_number=${encodeURIComponent(phoneNumber)}&invite_method=${inviteMethod}`,
    "POST",
    token
  );
};

export const getMyInvites = async (token: string): Promise<{
  invites: any[];
  stats: { total_invites: number; total_converted: number; conversion_rate: number };
}> => {
  return apiRequest("/contacts/my-invites", "GET", token);
};

export const getReferralCode = async (token: string): Promise<{ referral_code: string }> => {
  return apiRequest<{ referral_code: string }>("/contacts/referral-code", "GET", token);
};

export const applyReferralCode = async (token: string, referralCode: string): Promise<{ success: boolean; message: string; referrer_name: string }> => {
  return apiRequest(
    `/contacts/apply-referral?referral_code=${encodeURIComponent(referralCode)}`,
    "POST",
    token
  );
};
