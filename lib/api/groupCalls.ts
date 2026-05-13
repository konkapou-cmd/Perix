import { apiRequest, GroupCallResponse, GroupCallParticipant, ParticipantTokenResponse } from "./core";

export const createGroupCall = async (
  token: string,
  participantIds: string[],
  callType: "video" | "voice" = "video",
  groupName?: string
): Promise<GroupCallResponse> => {
  return apiRequest<GroupCallResponse>("/calls/group/create", "POST", token, {
    participant_ids: participantIds,
    call_type: callType,
    group_name: groupName,
  });
};

export const getGroupCall = async (token: string, groupCallId: string): Promise<GroupCallResponse> => {
  return apiRequest<GroupCallResponse>(`/calls/group/${groupCallId}`, "GET", token);
};

export const joinGroupCall = async (token: string, groupCallId: string): Promise<ParticipantTokenResponse> => {
  return apiRequest<ParticipantTokenResponse>(`/calls/group/${groupCallId}/join`, "POST", token);
};

export const addParticipantToGroupCall = async (
  token: string,
  groupCallId: string,
  userId: string
): Promise<{ message: string; participant: GroupCallParticipant; total_participants: number }> => {
  return apiRequest(`/calls/group/${groupCallId}/add-participant`, "POST", token, { user_id: userId });
};

export const leaveGroupCall = async (token: string, groupCallId: string): Promise<{ message: string; reason?: string }> => {
  return apiRequest(`/calls/group/${groupCallId}/leave`, "POST", token);
};

export const endGroupCall = async (token: string, groupCallId: string): Promise<{ message: string }> => {
  return apiRequest(`/calls/group/${groupCallId}/end`, "POST", token);
};

export const getMyGroupCalls = async (
  token: string,
  status?: string,
  limit: number = 20
): Promise<GroupCallResponse[]> => {
  const params = new URLSearchParams();
  if (status) params.append("status", status);
  params.append("limit", limit.toString());
  return apiRequest<GroupCallResponse[]>(`/calls/group/my-calls?${params}`, "GET", token);
};
