import Constants from 'expo-constants';
import { storage } from './storage';

export type StaffUser = { id: string; name: string | null; email: string; role: 'STAFF' | 'ADMIN' | 'CUSTOMER' };
export type OrderItem = { id: string; name: string; quantity: number; unitPrice: number; lineTotal: number; instructions?: string | null; variantName?: string | null };
export type StaffOrder = { id: string; orderNumber: string; status: string; type: string; paymentStatus: string; paymentMethod: string; customerName: string; customerPhone: string; deliveryAddress?: string | null; tableNumber?: string | null; notes?: string | null; total: number; createdAt: string; items: OrderItem[] };
export type DispatchDelivery = { id: string; orderId: string; orderNumber: string; deliveryStatus: string; rider: { id: string; name: string | null; phone: string | null; vehicleType: string } | null; assignedAt: string; acceptedAt: string | null };
export type DispatchBoard = { deliveries: DispatchDelivery[]; undispatchedOrders: { id: string; orderNumber: string; status: string }[] };
export type DispatchRider = { id: string; name: string | null; phone: string | null; vehicleType: string; isBlocked: boolean; licenseStatus: string; licenseExpiresAt: string | null; shiftStatus: string; activeDeliveriesCount: number };
export type AdminReport = { summary: { totalOrders: number; completedOrders: number; activeOrders: number; totalReservations: number; totalEvents: number; totalRevenuePaisa: number; totalRevenueNpr: number }; recentOrders: { id: string; orderNumber: string; customerName: string; total: number; status: string; type: string; createdAt: string }[]; topSellingDishes: { dishId: string | null; name: string; quantitySold: number; totalSalesPaisa: number }[] };
export type AdminCategory = { id: string; name: string; isActive: boolean; sortOrder: number; _count?: { dishes: number } };
export type AdminDish = { id: string; name: string; price: number; isAvailable: boolean; isFeatured: boolean; category: { id: string; name: string } };
export type AdminReservation = { id: string; name: string; email: string; phone: string; date: string; guests: number; occasion?: string | null; status: string; tableNumber?: string | null; adminNotes?: string | null };
export type AdminEventBooking = { id: string; name: string; email: string; phone: string; eventType: string; eventDate: string; guests: number; status: string; adminNotes?: string | null; venue?: { name: string } | null };
export type AdminRider = DispatchRider & { email: string; isBlocked: boolean; licenseStatus: string; shiftStatus: string; activeDeliveriesCount: number };
export const API_BASE = (process.env.EXPO_PUBLIC_API_URL || Constants.expoConfig?.extra?.apiUrl || 'https://purplehaze-nine.vercel.app/api/v1').replace(/\/+$/, '');
let refresh: Promise<string | null> | null = null;

async function renew() {
  const refreshToken = await storage.get('ph.staff.refresh');
  if (!refreshToken) return null;
  const response = await fetch(`${API_BASE}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) });
  if (!response.ok) { await Promise.all([storage.delete('ph.staff.access'), storage.delete('ph.staff.refresh')]); return null; }
  const json = await response.json();
  const tokens = json.data?.tokens;
  if (!tokens?.accessToken || !tokens.refreshToken) return null;
  await Promise.all([storage.set('ph.staff.access', tokens.accessToken), storage.set('ph.staff.refresh', tokens.refreshToken)]);
  return tokens.accessToken as string;
}

export async function api<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const token = await storage.get('ph.staff.access');
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });
  if (response.status === 401 && !retried && !path.startsWith('/auth/')) {
    refresh ??= renew().finally(() => { refresh = null; });
    if (await refresh) return api<T>(path, init, true);
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result || result.error) throw new Error(result?.error?.message || 'Could not reach Purple Haze. Check your connection.');
  return result.data as T;
}

export async function signIn(email: string, password: string): Promise<StaffUser> {
  const result = await api<{ user: StaffUser; tokens: { accessToken: string; refreshToken: string } }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  if (result.user.role !== 'STAFF' && result.user.role !== 'ADMIN') throw new Error('This account does not have restaurant staff access.');
  await Promise.all([storage.set('ph.staff.access', result.tokens.accessToken), storage.set('ph.staff.refresh', result.tokens.refreshToken), storage.set('ph.staff.user', JSON.stringify(result.user))]);
  return result.user;
}
export async function signOut() {
  await unregisterPushToken().catch(() => undefined);
  const refreshToken = await storage.get('ph.staff.refresh');
  if (refreshToken) await api('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }).catch(() => undefined);
  await Promise.all(['ph.staff.access', 'ph.staff.refresh', 'ph.staff.user'].map((key) => storage.delete(key)));
}
export async function listOrders(): Promise<StaffOrder[]> {
  const data = await api<StaffOrder[]>('/admin/orders?limit=100');
  return data;
}
export function updateOrder(id: string, status: string, note?: string) {
  return api<{ message: string; order: StaffOrder }>(`/admin/orders/${encodeURIComponent(id)}/status`, { method: 'PUT', body: JSON.stringify({ status, note }) });
}
export function getDispatchBoard() { return api<DispatchBoard>('/admin/deliveries'); }
export function getDispatchRiders() { return api<DispatchRider[]>('/admin/riders'); }
export function getAdminReport() { return api<AdminReport>('/admin/reports'); }
export function listAdminCategories() { return api<AdminCategory[]>('/admin/menu/categories'); }
export function listAdminDishes() { return api<AdminDish[]>('/admin/menu/dishes'); }
export function setDishAvailability(id: string, isAvailable: boolean) { return api<unknown>(`/admin/menu/dishes/${encodeURIComponent(id)}/availability`, { method: 'PATCH', body: JSON.stringify({ isAvailable }) }); }
export function listAdminReservations() { return api<AdminReservation[]>('/admin/reservations?limit=50'); }
export function updateAdminReservation(input: Pick<AdminReservation, 'id' | 'status'>) { return api<AdminReservation>('/admin/reservations', { method: 'PUT', body: JSON.stringify(input) }); }
export function listAdminEvents() { return api<AdminEventBooking[]>('/admin/event-bookings?limit=50'); }
export function updateAdminEvent(input: Pick<AdminEventBooking, 'id' | 'status'>) { return api<AdminEventBooking>('/admin/event-bookings', { method: 'PUT', body: JSON.stringify(input) }); }
export function listAdminRiders() { return api<AdminRider[]>('/admin/riders'); }
export function setRiderBlocked(id: string, isBlocked: boolean) { return api<unknown>(`/admin/riders/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ isBlocked }) }); }
export function assignRider(orderId: string, riderProfileId: string) {
  return api<unknown>('/admin/deliveries/dispatch', { method: 'POST', body: JSON.stringify({ orderId, riderProfileId }) });
}
export async function getRealtimeCredentials() {
  return api<{ url: string; anonKey: string; token: string }>('/realtime/auth', { method: 'POST', body: '{}' });
}
export async function registerPushToken(token: string, platform: 'android' | 'ios' | 'web') {
  await api('/notifications/push-token', { method: 'POST', body: JSON.stringify({ token, platform }) });
  await storage.set('ph.staff.push', token);
}
export async function unregisterPushToken() {
  const token = await storage.get('ph.staff.push');
  if (!token) return;
  await api('/notifications/push-token', { method: 'DELETE', body: JSON.stringify({ token }) });
  await storage.delete('ph.staff.push');
}
