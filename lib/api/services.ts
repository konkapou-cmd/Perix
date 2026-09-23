import { apiRequest, Service, TimeSlot, SlotAvailability, Booking, StayAvailability, DateBlock } from "./core";

export const getServices = async (token: string, businessId?: string, type?: string): Promise<Service[]> => {
  const params = new URLSearchParams();
  if (businessId) params.append("business_id", businessId);
  if (type) params.append("type", type);
  const data = await apiRequest<any>(`/services${params.toString() ? `?${params}` : ""}`, "GET", token);
  return Array.isArray(data) ? data : (data.services || []);
};

export const getNearbyServices = async (
  token: string,
  bounds?: { minLat?: number; maxLat?: number; minLng?: number; maxLng?: number },
  location?: { latitude?: number; longitude?: number },
  skip?: number,
  limit?: number
): Promise<{ services: Service[]; total: number }> => {
  const params = new URLSearchParams();
  if (bounds) {
    if (bounds.minLat !== undefined) params.append("min_lat", String(bounds.minLat));
    if (bounds.maxLat !== undefined) params.append("max_lat", String(bounds.maxLat));
    if (bounds.minLng !== undefined) params.append("min_lng", String(bounds.minLng));
    if (bounds.maxLng !== undefined) params.append("max_lng", String(bounds.maxLng));
  }
  if (location) {
    if (location.latitude !== undefined) params.append("latitude", String(location.latitude));
    if (location.longitude !== undefined) params.append("longitude", String(location.longitude));
  }
  if (skip !== undefined) params.append("skip", String(skip));
  if (limit !== undefined) params.append("limit", String(limit));
  return apiRequest<{ services: Service[]; total: number }>(`/services?${params.toString()}`, "GET", token);
};

export const getServiceDetail = async (serviceId: string, token?: string | null): Promise<Service> => {
  return apiRequest<Service>(`/services/${serviceId}`, "GET", token ?? undefined);
};

export const createService = async (token: string, payload: Partial<Service> & { business_id: string; type: string; name: string }): Promise<Service> => {
  return apiRequest<Service>("/services", "POST", token, payload);
};

export const updateService = async (token: string, serviceId: string, payload: Partial<Service>): Promise<Service> => {
  return apiRequest<Service>(`/services/${serviceId}`, "PUT", token, payload);
};

export const deleteService = async (token: string, serviceId: string): Promise<void> => {
  await apiRequest(`/services/${serviceId}`, "DELETE", token);
};

export const getSlots = async (serviceId: string): Promise<TimeSlot[]> => {
  return apiRequest<TimeSlot[]>(`/services/${serviceId}/slots`, "GET");
};

export const createSlot = async (token: string, payload: { service_id: string; day_of_week?: number; start_time: string; end_time: string; date?: string; is_recurring?: boolean }): Promise<TimeSlot> => {
  return apiRequest<TimeSlot>(`/services/${payload.service_id}/slots`, "POST", token, payload);
};

export const deleteSlot = async (token: string, serviceId: string, slotId: string): Promise<void> => {
  await apiRequest(`/services/${serviceId}/slots/${slotId}`, "DELETE", token);
};

export const setAvailability = async (
  token: string,
  serviceId: string,
  payload: { timezone: string; slots: { day_of_week?: number; date?: string; start_time: string; end_time: string; is_recurring: boolean; is_blocked?: boolean }[] },
): Promise<{ slots: TimeSlot[]; kept_booked_slots: number; skipped_conflicts: number }> => {
  return apiRequest<{ slots: TimeSlot[]; kept_booked_slots: number; skipped_conflicts: number }>(`/services/${serviceId}/availability`, "PUT", token, payload);
};

export const getAvailability = async (serviceId: string, date: string): Promise<any[]> => {
  return apiRequest<any[]>(`/services/${serviceId}/availability?date=${date}`, "GET");
};

export type CreateBookingPayload = {
  service_id: string;
  slot_id?: string;
  date: string;
  end_date?: string;
  client_name: string;
  client_email?: string;
  guests?: number;
  room_count?: number;
  adults?: number;
  children?: number;
  request_id?: string;
  notes?: string;
  pet_name?: string;
  pet_type?: string;
  pickup_location?: string;
  dropoff_location?: string;
  insurance_info?: string;
  reason_for_visit?: string;
  special_requests?: string;
};

export const createBooking = async (token: string, payload: CreateBookingPayload): Promise<Booking> => {
  return apiRequest<Booking>("/services/bookings", "POST", token, payload);
};

export const getBookings = async (token: string, businessId?: string, status?: string): Promise<Booking[]> => {
  const params = new URLSearchParams();
  if (businessId) params.append("business_id", businessId);
  if (status) params.append("status", status);
  return apiRequest<Booking[]>(`/services/bookings${params.toString() ? `?${params}` : ""}`, "GET", token);
};

export const confirmBooking = async (token: string, bookingId: string): Promise<Booking> => {
  return apiRequest<Booking>(`/services/bookings/${bookingId}/confirm`, "PUT", token);
};

export const declineBooking = async (token: string, bookingId: string): Promise<Booking> => {
  return apiRequest<Booking>(`/services/bookings/${bookingId}/decline`, "PUT", token);
};

export const cancelBooking = async (token: string, bookingId: string): Promise<Booking> => {
  return apiRequest<Booking>(`/services/bookings/${bookingId}/cancel`, "PUT", token);
};

export const completeBooking = async (token: string, bookingId: string): Promise<Booking> => {
  return apiRequest<Booking>(`/services/bookings/${bookingId}/complete`, "PUT", token);
};

export const blockSlots = async (token: string, serviceId: string, payload: { from_date: string; to_date: string }): Promise<{ success: boolean; blocked_count: number }> => {
  return apiRequest(`/services/${serviceId}/slots/block`, "POST", token, payload);
};

export const getStayAvailability = async (
  serviceId: string,
  params: { checkIn: string; checkOut: string; rooms: number; adults: number; children: number },
): Promise<StayAvailability> => {
  const query = new URLSearchParams({
    check_in: params.checkIn,
    check_out: params.checkOut,
    rooms: String(params.rooms),
    adults: String(params.adults),
    children: String(params.children),
  });
  return apiRequest<StayAvailability>(`/services/${serviceId}/stay-availability?${query}`, "GET");
};

export const getDateBlocks = async (token: string, serviceId: string): Promise<DateBlock[]> => {
  return apiRequest<DateBlock[]>(`/services/${serviceId}/date-blocks`, "GET", token);
};

export const createDateBlock = async (
  token: string,
  serviceId: string,
  payload: { start_date: string; end_date: string; blocked_units: number; reason?: string },
): Promise<DateBlock> => {
  return apiRequest<DateBlock>(`/services/${serviceId}/date-blocks`, "POST", token, payload);
};

export const deleteDateBlock = async (token: string, serviceId: string, blockId: string): Promise<void> => {
  await apiRequest(`/services/${serviceId}/date-blocks/${blockId}`, "DELETE", token);
};

export const sendServiceInquiry = async (token: string, serviceId: string, payload: { name: string; email: string; message: string }): Promise<{ success: boolean; message_id: string }> => {
  return apiRequest(`/services/${serviceId}/inquiry`, "POST", token, payload);
};
