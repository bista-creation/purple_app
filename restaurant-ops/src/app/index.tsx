import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import Constants from 'expo-constants';
import OrderAlarm from '../components/OrderAlarm';
import { API_BASE, assignRider, getAdminReport, getDispatchBoard, getDispatchRiders, listOrders, signIn, signOut, updateOrder, type DispatchDelivery, type DispatchRider, type StaffOrder, type StaffUser } from '../services/api';
import RiderAssignSheet from '../components/RiderAssignSheet';
import AdminOverview from '../components/AdminOverview';
import AdminTools from '../components/AdminTools';
import { storage } from '../services/storage';
import { connectOrderStream } from '../services/realtime';
import { palette as c } from '../theme/tokens';

const EMPTY_ORDERS: StaffOrder[] = [];
const money = (paisa: number) => `Rs ${Math.round(paisa / 100).toLocaleString('en-IN')}`;
const age = (value: string) => { const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000)); return minutes < 1 ? 'Just now' : `${minutes}m ago`; };
const pretty = (s: string) => s.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (x) => x.toUpperCase());

export default function OperationsScreen() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<StaffUser | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ringEnabled, setRingEnabled] = useState(true);
  const [pushState, setPushState] = useState('Push setup pending');
  const [assigningOrder, setAssigningOrder] = useState<StaffOrder | null>(null);
  const [dispatchBusy, setDispatchBusy] = useState(false);
  const [adminSection, setAdminSection] = useState<'overview' | 'orders' | 'dispatch' | 'menu' | 'bookings' | 'riders'>('orders');

  useEffect(() => {
    void Promise.all([storage.get('ph.staff.user'), storage.get('ph.staff.access')]).then(([raw, token]) => {
      if (raw && token) { try { const parsed = JSON.parse(raw) as StaffUser; if (parsed.role === 'STAFF' || parsed.role === 'ADMIN') { setUser(parsed); setAdminSection(parsed.role === 'ADMIN' ? 'overview' : 'orders'); } } catch { void signOut(); } }
    }).finally(() => setHydrated(true));
  }, []);

  const ordersQuery = useQuery({ queryKey: ['staff-orders'], queryFn: () => listOrders(), enabled: Boolean(user), refetchInterval: 5_000, refetchIntervalInBackground: false });
  const dispatchQuery = useQuery({ queryKey: ['dispatch-board'], queryFn: getDispatchBoard, enabled: Boolean(user), refetchInterval: 10_000, refetchIntervalInBackground: false });
  const ridersQuery = useQuery({ queryKey: ['staff-riders'], queryFn: getDispatchRiders, enabled: Boolean(user), refetchInterval: 30_000, refetchIntervalInBackground: false });
  const reportQuery = useQuery({ queryKey: ['admin-report'], queryFn: getAdminReport, enabled: user?.role === 'ADMIN', refetchInterval: 60_000, refetchIntervalInBackground: false });
  const deliveriesByOrder = useMemo(() => new Map((dispatchQuery.data?.deliveries ?? []).map((delivery) => [delivery.orderId, delivery])), [dispatchQuery.data]);
  const orders = ordersQuery.data ?? EMPTY_ORDERS;
  const pending = useMemo(() => orders.filter((order) => order.status === 'PENDING'), [orders]);
  const active = useMemo(() => orders.filter((order) => ['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'].includes(order.status)), [orders]);

  useEffect(() => {
    if (!user) return;
    let disconnect: (() => void) | undefined;
    let cancelled = false;
    void storage.get('ph.staff.access').then(async (token) => {
      if (!token) return;
      const stop = await connectOrderStream(queryClient, token);
      if (cancelled) stop(); else disconnect = stop;
    });
    return () => { cancelled = true; disconnect?.(); };
  }, [user, queryClient]);

  useEffect(() => {
    if (!user) return;
    const refreshOrders = () => {
      void queryClient.invalidateQueries({ queryKey: ['staff-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['dispatch-board'] });
    };
    const received = Notifications.addNotificationReceivedListener(refreshOrders);
    const opened = Notifications.addNotificationResponseReceivedListener(refreshOrders);
    return () => { received.remove(); opened.remove(); };
  }, [user, queryClient]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const configurePush = async () => {
      const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || Constants.expoConfig?.extra?.eas?.projectId;
      if (Platform.OS === 'web') { setPushState('Browser preview · live queue only'); return; }
      if (!projectId) { setPushState('Live queue on · add EAS project ID for push'); return; }
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('incoming-orders', {
            name: 'Incoming orders',
            description: 'Urgent new restaurant orders',
            importance: AndroidImportance.MAX,
            vibrationPattern: [0, 450, 180, 450, 180, 450],
            lightColor: '#F5B942',
            sound: 'order_alert.wav',
          });
        }
        const permission = await Notifications.requestPermissionsAsync();
        if (!active) return;
        if (!permission.granted) { setPushState('Notifications are disabled on this device'); return; }
        const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        if (!active) return;
        const platform = Platform.OS === 'ios' ? 'ios' : 'android';
        await (await import('../services/api')).registerPushToken(token, platform);
        if (active) setPushState('Push connected · live queue backup active');
      } catch { if (active) setPushState('Push setup needs a development build'); }
    };
    void configurePush();
    const tokenSubscription = Notifications.addPushTokenListener(() => {
      if (active) void configurePush();
    });
    return () => { active = false; tokenSubscription.remove(); };
  }, [user]);

  const authenticate = async () => {
    setBusy(true); setError('');
    try { const result = await signIn(email.trim(), password); setUser(result); setAdminSection(result.role === 'ADMIN' ? 'overview' : 'orders'); setPassword(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Sign in failed.'); }
    finally { setBusy(false); }
  };
  const logout = async () => { await signOut(); setUser(null); setPushState('Push setup pending'); queryClient.clear(); };
  const action = useCallback(async (order: StaffOrder, status: string, note?: string) => {
    setBusy(true);
    try { await updateOrder(order.id, status, note); await queryClient.invalidateQueries({ queryKey: ['staff-orders'] }); }
    catch (e) { Alert.alert('Order not updated', e instanceof Error ? e.message : 'Refresh the order and try again.'); }
    finally { setBusy(false); }
  }, [queryClient]);
  const dispatch = useCallback(async (order: StaffOrder, rider: DispatchRider) => {
    setDispatchBusy(true);
    try {
      await assignRider(order.id, rider.id);
      setAssigningOrder(null);
      Alert.alert('Rider assigned', `${rider.name || 'Rider'} has 120 seconds to accept order #${order.orderNumber}. The rider app will alert them.`);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['dispatch-board'] }), queryClient.invalidateQueries({ queryKey: ['staff-orders'] })]);
    } catch (e) { Alert.alert('Could not assign rider', e instanceof Error ? e.message : 'Refresh dispatch and try again.'); }
    finally { setDispatchBusy(false); }
  }, [queryClient]);

  if (!hydrated) return <View style={styles.loading}><ActivityIndicator color={c.gold} size="large" /></View>;
  if (!user) return <KeyboardAvoidingView style={styles.login} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View style={styles.loginCard}><View style={styles.logo}><Ionicons name="restaurant" size={26} color={c.gold} /></View><Text style={styles.kicker}>PURPLE HAZE · STAFF</Text><Text style={styles.loginTitle}>Order desk</Text><Text style={styles.loginSub}>Sign in with your restaurant staff account.</Text><TextInput value={email} onChangeText={setEmail} placeholder="Work email" placeholderTextColor="#887A92" keyboardType="email-address" autoCapitalize="none" style={styles.input} /><TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor="#887A92" secureTextEntry style={styles.input} />{error ? <Text style={styles.error}>{error}</Text> : null}<Pressable disabled={busy || !email || !password} onPress={() => void authenticate()} style={[styles.primary, (busy || !email || !password) && styles.dim]}>{busy ? <ActivityIndicator color={c.white} /> : <Text style={styles.primaryText}>Sign in to operations</Text>}</Pressable><Text style={styles.loginFoot}>Staff and admin access only · {API_BASE.replace('/api/v1', '')}</Text></View></KeyboardAvoidingView>;

  const isAdmin = user.role === 'ADMIN';
  const visiblePending = adminSection === 'dispatch' ? EMPTY_ORDERS : pending;
  const visibleActive = adminSection === 'dispatch' ? active.filter((order) => order.type === 'DELIVERY') : active;

  return <View style={styles.screen}><OrderAlarm active={Boolean(user && pending.length && ringEnabled)} /><View style={styles.header}><View style={styles.brandMark}><Ionicons name={isAdmin ? 'shield-checkmark' : 'restaurant'} size={18} color={c.gold} /></View><View style={{ flex: 1 }}><Text style={styles.brand}>PURPLE HAZE</Text><Text style={styles.subBrand}>{isAdmin ? 'ADMIN CONTROL PANEL' : 'STAFF ORDER DESK'}</Text></View><Pressable onPress={() => setRingEnabled((v) => !v)} style={[styles.soundButton, !ringEnabled && styles.soundMuted]}><Ionicons name={ringEnabled ? 'volume-high' : 'volume-mute'} size={20} color={c.white} /><Text style={styles.soundLabel}>{ringEnabled ? 'SOUND ON' : 'MUTED'}</Text></Pressable><Pressable onPress={() => void logout()} hitSlop={10} style={styles.logout}><Ionicons name="log-out-outline" size={21} color={c.white} /></Pressable></View>
    {isAdmin && <View style={styles.adminNavWrap}><ScrollView horizontal style={styles.adminNavScroll} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.adminNav}>{([{ id: 'overview', title: 'Overview', icon: 'grid-outline' }, { id: 'orders', title: 'Orders', icon: 'receipt-outline' }, { id: 'dispatch', title: 'Delivery', icon: 'bicycle-outline' }, { id: 'menu', title: 'Menu', icon: 'restaurant-outline' }, { id: 'bookings', title: 'Bookings', icon: 'calendar-outline' }, { id: 'riders', title: 'Riders', icon: 'people-outline' }] as const).map((item) => <Pressable accessibilityRole="button" accessibilityState={{ selected: adminSection === item.id }} key={item.id} onPress={() => setAdminSection(item.id)} style={[styles.adminNavItem, adminSection === item.id && styles.adminNavItemActive]}><Ionicons name={item.icon} size={15} color={adminSection === item.id ? c.white : '#D7C8E2'} /><Text style={[styles.adminNavText, adminSection === item.id && styles.adminNavTextActive]}>{item.title}</Text></Pressable>)}</ScrollView></View>}
    {isAdmin && adminSection === 'overview' ? <ScrollView><AdminOverview report={reportQuery.data} loading={reportQuery.isLoading} error={reportQuery.isError} onRetry={() => void reportQuery.refetch()} onOpen={(section) => setAdminSection(section)} /></ScrollView> : isAdmin && ['menu', 'bookings', 'riders'].includes(adminSection) ? <AdminTools section={adminSection as 'menu' | 'bookings' | 'riders'} /> : <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.welcomeRow}><View><Text style={styles.hello}>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'},</Text><Text style={styles.staffName}>{user.name || 'Team'}</Text></View><Pressable onPress={() => void ordersQuery.refetch()} style={styles.refresh}><Ionicons name="refresh" size={17} color={c.purple} /><Text style={styles.refreshText}>Refresh</Text></Pressable></View>
      <View style={[styles.connection, ordersQuery.isError && styles.connectionError]}><View style={[styles.dot, !ordersQuery.isError && styles.dotLive]} /><Text style={styles.connectionText}>{ordersQuery.isError ? 'Connection lost · retrying' : 'Order queue syncing'} · {pushState}</Text></View>
      <View style={styles.metrics}><View style={[styles.metric, styles.metricUrgent]}><Text style={styles.metricNumber}>{pending.length}</Text><Text style={styles.metricLabel}>NEEDS ACCEPTANCE</Text></View><View style={styles.metric}><Text style={styles.metricNumber}>{active.length}</Text><Text style={styles.metricLabel}>IN THE KITCHEN</Text></View></View>
      {adminSection !== 'dispatch' && pending.length > 0 && <View style={styles.alertBanner}><Ionicons name="notifications" size={19} color={c.white} /><View style={{ flex: 1 }}><Text style={styles.alertTitle}>New order · action needed</Text><Text style={styles.alertBody}>{pending.length} order{pending.length === 1 ? '' : 's'} waiting for staff</Text></View><Pressable onPress={() => setRingEnabled(false)}><Text style={styles.silence}>SILENCE</Text></Pressable></View>}
      {adminSection !== 'dispatch' && <><View style={styles.sectionRow}><Text style={styles.sectionTitle}>AWAITING ACCEPTANCE</Text><Text style={styles.count}>{pending.length}</Text></View>
      {ordersQuery.isLoading ? <View style={styles.empty}><ActivityIndicator color={c.purple} /><Text style={styles.emptyText}>Loading live orders…</Text></View> : ordersQuery.isError ? <Pressable onPress={() => void ordersQuery.refetch()} style={styles.retry}><Text style={styles.retryText}>Could not load orders. Tap to retry.</Text></Pressable> : visiblePending.length ? visiblePending.map((order) => <OrderCard key={order.id} order={order} urgent onUpdate={action} busy={busy} />) : <View style={styles.empty}><Ionicons name="checkmark-circle-outline" size={25} color={c.green} /><Text style={styles.emptyTitle}>All caught up</Text><Text style={styles.emptyText}>New orders will show here and alert the team.</Text></View>}</>}
      <View style={[styles.sectionRow, { marginTop: 24 }]}><Text style={styles.sectionTitle}>{adminSection === 'dispatch' ? 'DELIVERY DISPATCH' : 'KITCHEN & DISPATCH'}</Text><Text style={styles.count}>{visibleActive.length}</Text></View>
      {visibleActive.length ? visibleActive.map((order) => <OrderCard key={order.id} order={order} onUpdate={action} busy={busy} delivery={deliveriesByOrder.get(order.id)} onAssign={() => setAssigningOrder(order)} />) : <Text style={styles.quiet}>{adminSection === 'dispatch' ? 'Ready delivery orders will appear here.' : 'Accepted orders will appear here.'}</Text>}
      <Text style={styles.footer}>Live order alerts require notification permission and a configured EAS project. The queue also refreshes every 5 seconds while this app is open.</Text>
    </ScrollView>}
    <RiderAssignSheet visible={Boolean(assigningOrder)} orderNumber={assigningOrder?.orderNumber || ''} riders={ridersQuery.data ?? []} loading={ridersQuery.isLoading} error={ridersQuery.isError} submitting={dispatchBusy} onRetry={() => void ridersQuery.refetch()} onClose={() => setAssigningOrder(null)} onAssign={(rider) => { if (assigningOrder) void dispatch(assigningOrder, rider); }} />
  </View>;
}

function OrderCard({ order, urgent, busy, onUpdate, delivery, onAssign }: { order: StaffOrder; urgent?: boolean; busy: boolean; onUpdate: (order: StaffOrder, status: string, note?: string) => Promise<void>; delivery?: DispatchDelivery; onAssign?: () => void }) {
  const next = order.status === 'CONFIRMED' ? 'PREPARING' : order.status === 'PREPARING' ? 'READY' : order.status === 'READY' && order.type !== 'DELIVERY' ? 'COMPLETED' : null;
  return <View style={[styles.orderCard, urgent && styles.orderUrgent]}>
    <View style={styles.orderTop}><View><Text style={styles.orderNumber}>#{order.orderNumber}</Text><Text style={styles.orderTime}>{age(order.createdAt)} · {order.type.replaceAll('_', ' ')}</Text></View><View style={[styles.statusPill, urgent && styles.statusUrgent]}><Text style={[styles.statusText, urgent && styles.statusTextUrgent]}>{pretty(order.status)}</Text></View></View>
    <View style={styles.rule} /><Text style={styles.customer}>{order.customerName}</Text>{order.customerPhone ? <Text style={styles.detail}>{order.customerPhone}</Text> : null}
    {order.items?.map((item) => <View key={item.id} style={styles.itemRow}><Text style={styles.itemName}>{item.quantity} × {item.name}{item.variantName ? ` · ${item.variantName}` : ''}</Text><Text style={styles.itemPrice}>{money(item.lineTotal)}</Text></View>)}
    {order.deliveryAddress ? <Text style={styles.delivery}>DELIVERY · {order.deliveryAddress}</Text> : order.tableNumber ? <Text style={styles.delivery}>TABLE · {order.tableNumber}</Text> : null}
    {order.notes ? <Text style={styles.notes}>Note: {order.notes}</Text> : null}
    <View style={styles.totalRow}><Text style={styles.totalLabel}>{order.paymentMethod} · {order.paymentStatus}</Text><Text style={styles.total}>{money(order.total)}</Text></View>
    {urgent ? <View style={styles.actions}><Pressable disabled={busy} onPress={() => void onUpdate(order, 'CANCELLED', 'Declined by restaurant staff.')} style={styles.decline}><Text style={styles.declineText}>Decline</Text></Pressable><Pressable disabled={busy} onPress={() => void onUpdate(order, 'CONFIRMED')} style={styles.accept}><Ionicons name="checkmark" size={17} color={c.white} /><Text style={styles.acceptText}>Accept order</Text></Pressable></View> : next ? <Pressable disabled={busy} onPress={() => void onUpdate(order, next)} style={styles.advance}><Text style={styles.advanceText}>{next === 'PREPARING' ? 'Start preparing' : next === 'READY' ? 'Mark ready' : 'Complete pickup'}</Text><Ionicons name="arrow-forward" size={15} color={c.purple} /></Pressable> : order.status === 'READY' && order.type === 'DELIVERY' ? delivery && ['ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'ARRIVED_AT_CUSTOMER'].includes(delivery.deliveryStatus) ? <View style={styles.dispatchStatus}><Ionicons name="bicycle" size={16} color={c.purple} /><Text style={styles.handoff}>{pretty(delivery.deliveryStatus)} · {delivery.rider?.name || 'Rider assigned'}</Text></View> : <Pressable onPress={onAssign} style={styles.dispatchButton}><Ionicons name="bicycle" size={16} color={c.white} /><Text style={styles.dispatchButtonText}>{delivery ? 'Assign another rider' : 'Assign rider'}</Text></Pressable> : null}
  </View>;
}

const styles = StyleSheet.create({ loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.paper }, screen: { flex: 1, backgroundColor: c.paper }, adminNavWrap: { height: 53, backgroundColor: c.plum }, adminNavScroll: { flexGrow: 0 }, adminNav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 7 }, adminNavItem: { height: 37, minWidth: 82, paddingHorizontal: 10, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#43235D' }, adminNavItemActive: { backgroundColor: c.purple }, adminNavText: { color: '#D7C8E2', fontSize: 9, fontWeight: '800' }, adminNavTextActive: { color: c.white }, header: { minHeight: 72, paddingHorizontal: 18, paddingTop: Platform.OS === 'ios' ? 46 : 16, paddingBottom: 12, backgroundColor: c.plum, flexDirection: 'row', alignItems: 'center', gap: 10 }, brandMark: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#43235D', alignItems: 'center', justifyContent: 'center' }, brand: { color: c.white, fontSize: 13, fontWeight: '900', letterSpacing: 1.1 }, subBrand: { color: '#CBB9DE', fontSize: 8, fontWeight: '700', letterSpacing: 1.4, marginTop: 3 }, soundButton: { backgroundColor: '#43235D', borderRadius: 11, paddingHorizontal: 9, height: 36, flexDirection: 'row', alignItems: 'center', gap: 5 }, soundMuted: { backgroundColor: '#665A71' }, soundLabel: { color: c.white, fontSize: 8, fontWeight: '900' }, logout: { padding: 7 }, content: { padding: 16, paddingBottom: 38, maxWidth: 700, width: '100%', alignSelf: 'center' }, welcomeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 9 }, hello: { color: c.muted, fontSize: 12 }, staffName: { color: c.plum, fontSize: 22, fontWeight: '900', marginTop: 2 }, refresh: { height: 35, paddingHorizontal: 10, borderRadius: 10, backgroundColor: c.white, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: c.border }, refreshText: { color: c.purple, fontSize: 11, fontWeight: '800' }, connection: { marginTop: 13, padding: 10, borderRadius: 10, backgroundColor: '#E8F5ED', flexDirection: 'row', alignItems: 'center', gap: 7 }, connectionError: { backgroundColor: '#FFF1ED' }, dot: { width: 7, height: 7, borderRadius: 5, backgroundColor: c.red }, dotLive: { backgroundColor: c.green }, connectionText: { flex: 1, color: c.muted, fontSize: 10 }, metrics: { flexDirection: 'row', gap: 10, marginTop: 12 }, metric: { flex: 1, minHeight: 83, padding: 12, borderRadius: 14, backgroundColor: c.white, borderWidth: 1, borderColor: c.border }, metricUrgent: { borderColor: '#F0C9C5', backgroundColor: '#FFF8F6' }, metricNumber: { color: c.plum, fontSize: 27, fontWeight: '900' }, metricLabel: { color: c.muted, fontSize: 8, letterSpacing: 1, fontWeight: '900', marginTop: 5 }, alertBanner: { marginTop: 13, borderRadius: 13, backgroundColor: c.red, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 }, alertTitle: { color: c.white, fontWeight: '900', fontSize: 12 }, alertBody: { color: '#FFE1DD', fontSize: 10, marginTop: 2 }, silence: { color: c.white, fontSize: 9, fontWeight: '900', padding: 5 }, sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 8 }, sectionTitle: { color: c.muted, fontSize: 10, letterSpacing: 1.2, fontWeight: '900' }, count: { color: c.purple, fontSize: 11, fontWeight: '900' }, orderCard: { backgroundColor: c.white, borderWidth: 1, borderColor: c.border, borderRadius: 15, padding: 14, marginTop: 9 }, orderUrgent: { borderColor: '#E6B7B2', borderWidth: 1.5 }, orderTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, orderNumber: { color: c.plum, fontSize: 17, fontWeight: '900' }, orderTime: { color: c.muted, fontSize: 10, marginTop: 4 }, statusPill: { backgroundColor: c.lavender, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 9 }, statusUrgent: { backgroundColor: '#FBE8E5' }, statusText: { color: c.deep, fontSize: 9, fontWeight: '900' }, statusTextUrgent: { color: c.red }, rule: { height: 1, backgroundColor: c.border, marginVertical: 11 }, customer: { color: c.ink, fontSize: 13, fontWeight: '800' }, detail: { color: c.muted, fontSize: 11, marginTop: 3 }, itemRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderColor: '#F1EDF4' }, itemName: { color: c.ink, fontSize: 11, flex: 1 }, itemPrice: { color: c.ink, fontSize: 11, fontWeight: '700' }, delivery: { color: c.purple, fontSize: 9, fontWeight: '900', marginTop: 10 }, notes: { color: c.amber, fontSize: 10, marginTop: 8, fontStyle: 'italic' }, totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10 }, totalLabel: { color: c.muted, fontSize: 9, fontWeight: '700' }, total: { color: c.plum, fontSize: 15, fontWeight: '900' }, actions: { flexDirection: 'row', gap: 9, marginTop: 13 }, decline: { borderWidth: 1, borderColor: '#E7C3C0', borderRadius: 11, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' }, declineText: { color: c.red, fontWeight: '900', fontSize: 11 }, accept: { flex: 1, backgroundColor: c.purple, borderRadius: 11, paddingVertical: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5 }, acceptText: { color: c.white, fontWeight: '900', fontSize: 12 }, advance: { marginTop: 12, borderRadius: 10, backgroundColor: c.lavender, padding: 11, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, advanceText: { color: c.deep, fontSize: 11, fontWeight: '900' }, handoff: { color: c.muted, fontSize: 10, marginTop: 12, padding: 9, backgroundColor: '#F8F6FA', borderRadius: 8 }, dispatchStatus: { marginTop: 9, padding: 10, borderRadius: 9, backgroundColor: c.lavender, flexDirection: 'row', alignItems: 'center', gap: 7 }, dispatchButton: { marginTop: 11, height: 42, paddingHorizontal: 12, borderRadius: 10, backgroundColor: c.purple, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, dispatchButtonText: { color: c.white, fontSize: 11, fontWeight: '900' }, empty: { minHeight: 105, alignItems: 'center', justifyContent: 'center', padding: 18, gap: 6, backgroundColor: c.white, borderRadius: 14, borderWidth: 1, borderColor: c.border }, emptyTitle: { color: c.plum, fontWeight: '900', fontSize: 14 }, emptyText: { color: c.muted, fontSize: 11, textAlign: 'center' }, retry: { padding: 16, borderRadius: 12, backgroundColor: c.white }, retryText: { color: c.red, textAlign: 'center', fontWeight: '700' }, quiet: { color: c.muted, padding: 12, fontSize: 11 }, footer: { marginTop: 20, color: c.muted, fontSize: 9, lineHeight: 14, textAlign: 'center' }, login: { flex: 1, minHeight: '100%', backgroundColor: c.plum, justifyContent: 'center', padding: 20 }, loginCard: { width: '100%', maxWidth: 420, alignSelf: 'center', padding: 22, borderRadius: 20, backgroundColor: c.paper }, logo: { width: 50, height: 50, borderRadius: 16, backgroundColor: c.deep, alignItems: 'center', justifyContent: 'center' }, kicker: { color: c.purple, fontSize: 9, letterSpacing: 1.5, fontWeight: '900', marginTop: 22 }, loginTitle: { color: c.plum, fontSize: 28, fontWeight: '900', marginTop: 5 }, loginSub: { color: c.muted, fontSize: 12, marginTop: 6, marginBottom: 17 }, input: { height: 47, borderWidth: 1, borderColor: c.border, backgroundColor: c.white, borderRadius: 11, paddingHorizontal: 12, color: c.ink, marginTop: 10 }, error: { color: c.red, fontSize: 11, marginTop: 8 }, primary: { marginTop: 14, height: 48, borderRadius: 11, backgroundColor: c.purple, alignItems: 'center', justifyContent: 'center' }, dim: { opacity: 0.55 }, primaryText: { color: c.white, fontWeight: '900' }, loginFoot: { color: c.muted, fontSize: 8, marginTop: 14, textAlign: 'center' } });
