import { apiRequest, CallToken, CallResponse, CallRecord } from "./core";

export const generateCallToken = async (
  token: string,
  channel?: string,
  uid?: number,
  role?: number
): Promise<CallToken> => {
  return apiRequest<CallToken>("/calls/token", "POST", token, { channel, uid: uid || 0, role: role || 1 });
};

export const initiateCall = async (
  token: string,
  toUserId?: string,
  callType: "voice" | "video" = "video",
  toBusinessId?: string
): Promise<CallResponse> => {
  return apiRequest<CallResponse>("/calls/initiate", "POST", token, {
    to_user_id: toUserId,
    to_business_id: toBusinessId,
    call_type: callType,
  });
};

export const answerCall = async (token: string, callId: string): Promise<CallResponse> => {
  return apiRequest<CallResponse>(`/calls/answer/${callId}`, "POST", token);
};

export const endCall = async (token: string, callId: string): Promise<{ success: boolean; call_id: string; status: string }> => {
  return apiRequest<{ success: boolean; call_id: string; status: string }>(`/calls/end/${callId}`, "POST", token);
};

export const rejectCall = async (token: string, callId: string): Promise<{ success: boolean; call_id: string; status: string }> => {
  return apiRequest<{ success: boolean; call_id: string; status: string }>(`/calls/reject/${callId}`, "POST", token);
};

export const getCallStatus = async (token: string, callId: string): Promise<{
  call_id: string;
  status: string;
  call_type: string;
  caller_id: string;
  callee_id: string;
  created_at: string;
  answered_at?: string;
  ended_at?: string;
}> => {
  return apiRequest(`/calls/status/${callId}`, "GET", token);
};

export const getPendingCalls = async (token: string): Promise<CallRecord[]> => {
  return apiRequest<CallRecord[]>("/calls/pending", "GET", token);
};

export const getCallHistory = async (token: string): Promise<CallRecord[]> => {
  return apiRequest<CallRecord[]>("/calls/history", "GET", token);
};
