import { apiRequest, Service, TimeSlot, Booking, SlotAvailability } from "./core";

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

export const getServiceDetail = async (serviceId: string): Promise<Service> => {
  return apiRequest<Service>(`/services/${serviceId}`, "GET");
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
  payload: { timezone: string; slots: { day_of_week?: number; date?: string; start_time: string; end_time: string; is_recurring: boolean }[] },
): Promise<TimeSlot[]> => {
  return apiRequest<TimeSlot[]>(`/services/${serviceId}/availability`, "PUT", token, payload);
};

export const getAvailability = async (serviceId: string, date: string): Promise<SlotAvailability[]> => {
  return apiRequest<SlotAvailability[]>(`/services/${serviceId}/availability?date=${date}`, "GET");
};

export const createBooking = async (token: string, payload: { service_id: string; slot_id?: string; date: string; end_date?: string; client_name: string; client_email?: string; guests?: number; notes?: string }): Promise<Booking> => {
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

export const cancelBooking = async (token: string, bookingId: string): Promise<Booking> => {
  return apiRequest<Booking>(`/services/bookings/${bookingId}/cancel`, "PUT", token);
};

export const completeBooking = async (token: string, bookingId: string): Promise<Booking> => {
  return apiRequest<Booking>(`/services/bookings/${bookingId}/complete`, "PUT", token);
};

export const blockSlots = async (token: string, serviceId: string, payload: { from_date: string; to_date: string }): Promise<{ success: boolean; blocked_count: number }> => {
  return apiRequest(`/services/${serviceId}/slots/block`, "POST", token, payload);
};

export const sendServiceInquiry = async (token: string, serviceId: string, payload: { name: string; email: string; message: string }): Promise<{ success: boolean; message_id: string }> => {
  return apiRequest(`/services/${serviceId}/inquiry`, "POST", token, payload);
};
