import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useKeepAwake } from 'expo-keep-awake';
import OrderAlarm from '../components/OrderAlarm';
import UrgentOrderBar from '../components/UrgentOrderBar';
import NewOrderAlertModal from '../components/NewOrderAlertModal';
import NotificationSettingsModal from '../components/NotificationSettingsModal';
import {
  API_BASE,
  assignRider,
  getAdminReport,
  getDispatchBoard,
  getDispatchRiders,
  listAdminEvents,
  listAdminReservations,
  listOrders,
  signIn,
  signOut,
  updateOrder,
  type DispatchDelivery,
  type DispatchRider,
  type StaffOrder,
  type StaffUser,
} from '../services/api';
import RiderAssignSheet from '../components/RiderAssignSheet';
import AdminOverview from '../components/AdminOverview';
import AdminTools from '../components/AdminTools';
import { storage } from '../services/storage';
import { connectOrderStream } from '../services/realtime';
import {
  dismissOrderAlert,
  registerPushForStaff,
  scheduleLocalOrderAlert,
} from '../services/notifications';
import { palette as c, radii, shadows } from '../theme/tokens';

const EMPTY_ORDERS: StaffOrder[] = [];
const money = (paisa: number) => `Rs ${Math.round(paisa / 100).toLocaleString('en-IN')}`;
const age = (value: string) => {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  return minutes < 1 ? 'Just now' : `${minutes}m ago`;
};
const pretty = (s: string) => s.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (x) => x.toUpperCase());

export default function OperationsScreen() {
  useKeepAwake();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<StaffUser | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Audio, Vibration & Alert Controls
  const [masterSoundEnabled, setMasterSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [snoozedOrderIds, setSnoozedOrderIds] = useState<Set<string>>(new Set());
  const seenOrderIds = useRef<Set<string>>(new Set());
  const [newOrderModal, setNewOrderModal] = useState<StaffOrder | null>(null);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [testSignal, setTestSignal] = useState(0);
  const [webAutoplayBlocked, setWebAutoplayBlocked] = useState(false);

  const [pushState, setPushState] = useState('Push setup pending');
  const [assigningOrder, setAssigningOrder] = useState<StaffOrder | null>(null);
  const [dispatchBusy, setDispatchBusy] = useState(false);
  const [adminSection, setAdminSection] = useState<'overview' | 'orders' | 'dispatch' | 'menu' | 'bookings' | 'riders'>('orders');

  useEffect(() => {
    void Promise.all([storage.get('ph.staff.user'), storage.get('ph.staff.access')])
      .then(([raw, token]) => {
        if (raw && token) {
          try {
            const parsed = JSON.parse(raw) as StaffUser;
            if (parsed.role === 'STAFF' || parsed.role === 'ADMIN') {
              setUser(parsed);
              setAdminSection(parsed.role === 'ADMIN' ? 'overview' : 'orders');
            }
          } catch {
            void signOut();
          }
        }
      })
      .finally(() => setHydrated(true));
  }, []);

  const ordersQuery = useQuery({
    queryKey: ['staff-orders'],
    queryFn: () => listOrders(),
    enabled: Boolean(user),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });

  const dispatchQuery = useQuery({
    queryKey: ['dispatch-board'],
    queryFn: getDispatchBoard,
    enabled: Boolean(user),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });

  const ridersQuery = useQuery({
    queryKey: ['staff-riders'],
    queryFn: getDispatchRiders,
    enabled: Boolean(user),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const reportQuery = useQuery({
    queryKey: ['admin-report'],
    queryFn: getAdminReport,
    enabled: user?.role === 'ADMIN',
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const reservationsQuery = useQuery({
    queryKey: ['admin-reservations'],
    queryFn: listAdminReservations,
    enabled: user?.role === 'ADMIN',
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const eventsQuery = useQuery({
    queryKey: ['admin-event-bookings'],
    queryFn: listAdminEvents,
    enabled: user?.role === 'ADMIN',
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const deliveriesByOrder = useMemo(
    () => new Map((dispatchQuery.data?.deliveries ?? []).map((delivery) => [delivery.orderId, delivery])),
    [dispatchQuery.data]
  );

  const orders = ordersQuery.data ?? EMPTY_ORDERS;
  const pending = useMemo(() => orders.filter((order) => order.status === 'PENDING'), [orders]);
  const active = useMemo(
    () => orders.filter((order) => ['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'].includes(order.status)),
    [orders]
  );
  const preparingCount = useMemo(
    () => orders.filter((order) => order.status === 'CONFIRMED' || order.status === 'PREPARING').length,
    [orders]
  );
  const readyCount = useMemo(
    () => orders.filter((order) => order.status === 'READY' || order.status === 'OUT_FOR_DELIVERY').length,
    [orders]
  );

  // Un-snoozed pending orders determine if the continuous alarm plays
  const unSnoozedPending = useMemo(
    () => pending.filter((order) => !snoozedOrderIds.has(order.id)),
    [pending, snoozedOrderIds]
  );
  const isAlarmRinging = Boolean(user && masterSoundEnabled && unSnoozedPending.length > 0);
  const isAlarmSnoozed = Boolean(pending.length > 0 && unSnoozedPending.length === 0);

  // Auto-detect newly arrived orders & trigger alerts
  useEffect(() => {
    if (!orders.length) return;

    let hasBrandNew = false;
    let newestOrder: StaffOrder | null = null;

    for (const order of orders) {
      if (order.status === 'PENDING') {
        if (!seenOrderIds.current.has(order.id)) {
          seenOrderIds.current.add(order.id);
          hasBrandNew = true;
          newestOrder = order;
          void scheduleLocalOrderAlert(order);
        }
      }
    }

    // When a brand new pending order arrives, wake up snooze & show alert modal
    if (hasBrandNew && newestOrder) {
      setSnoozedOrderIds(new Set()); // Auto re-arm alarm
      setNewOrderModal(newestOrder);
    }
  }, [orders]);

  // Connect Realtime stream for instantaneous order updates
  useEffect(() => {
    if (!user) return;
    let disconnect: (() => void) | undefined;
    let cancelled = false;

    void storage.get('ph.staff.access').then(async (token) => {
      if (!token) return;
      const stop = await connectOrderStream(queryClient, token);
      if (cancelled) stop();
      else disconnect = stop;
    });

    return () => {
      cancelled = true;
      disconnect?.();
    };
  }, [user, queryClient]);

  // Notifications foreground listeners
  useEffect(() => {
    if (!user) return;
    const refreshOrders = () => {
      void queryClient.invalidateQueries({ queryKey: ['staff-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['dispatch-board'] });
    };
    const received = Notifications.addNotificationReceivedListener(refreshOrders);
    const opened = Notifications.addNotificationResponseReceivedListener(refreshOrders);
    return () => {
      received.remove();
      opened.remove();
    };
  }, [user, queryClient]);

  // Register push notifications
  const configurePush = useCallback(async () => {
    if (!user) return;
    const res = await registerPushForStaff();
    setPushState(res.status);
  }, [user]);

  useEffect(() => {
    void configurePush();
    const tokenSubscription = Notifications.addPushTokenListener(() => {
      void configurePush();
    });
    return () => {
      tokenSubscription.remove();
    };
  }, [configurePush]);

  const authenticate = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await signIn(email.trim(), password);
      setUser(result);
      setAdminSection(result.role === 'ADMIN' ? 'overview' : 'orders');
      setPassword('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await signOut();
    setUser(null);
    setPushState('Push setup pending');
    seenOrderIds.current.clear();
    setSnoozedOrderIds(new Set());
    setNewOrderModal(null);
    queryClient.clear();
  };

  const action = useCallback(
    async (order: StaffOrder, status: string, note?: string) => {
      setBusy(true);
      try {
        await updateOrder(order.id, status, note);
        void dismissOrderAlert(order.id);
        setSnoozedOrderIds((prev) => {
          const next = new Set(prev);
          next.delete(order.id);
          return next;
        });
        if (newOrderModal?.id === order.id) {
          setNewOrderModal(null);
        }
        await queryClient.invalidateQueries({ queryKey: ['staff-orders'] });
      } catch (e) {
        Alert.alert('Order not updated', e instanceof Error ? e.message : 'Refresh the order and try again.');
      } finally {
        setBusy(false);
      }
    },
    [queryClient, newOrderModal]
  );

  const dispatch = useCallback(
    async (order: StaffOrder, rider: DispatchRider) => {
      setDispatchBusy(true);
      try {
        await assignRider(order.id, rider.id);
        setAssigningOrder(null);
        Alert.alert(
          'Rider assigned',
          `${rider.name || 'Rider'} has 120 seconds to accept order #${order.orderNumber}. The rider app will alert them.`
        );
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['dispatch-board'] }),
          queryClient.invalidateQueries({ queryKey: ['staff-orders'] }),
        ]);
      } catch (e) {
        Alert.alert('Could not assign rider', e instanceof Error ? e.message : 'Refresh dispatch and try again.');
      } finally {
        setDispatchBusy(false);
      }
    },
    [queryClient]
  );

  const handleSnoozeCurrentAlarm = () => {
    setSnoozedOrderIds(new Set(pending.map((o) => o.id)));
  };

  const unlockWebAudio = () => {
    setTestSignal((s) => s + 1);
    setWebAutoplayBlocked(false);
  };

  if (!hydrated) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={c.gold} size="large" />
      </View>
    );
  }

  if (!user) {
    return (
      <KeyboardAvoidingView style={styles.login} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.loginCard}>
          <View style={styles.logoBadgeContainer}>
            <Image
              source={require('../../assets/images/app-icon.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          <View style={styles.loginKickerRow}>
            <View style={styles.opsTag}>
              <Text style={styles.opsTagText}>OPS CONTROL</Text>
            </View>
            <Text style={styles.kicker}>PURPLE HAZE RESTAURANT</Text>
          </View>
          <Text style={styles.loginTitle}>Staff Order Desk</Text>
          <Text style={styles.loginSub}>Sign in with your verified restaurant staff or manager account.</Text>

          <View style={styles.inputContainer}>
            <Ionicons name="mail-outline" size={18} color={c.muted} style={styles.inputIcon} />
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Staff work email"
              placeholderTextColor={c.mutedLight}
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.inputWithIcon}
            />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={18} color={c.muted} style={styles.inputIcon} />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={c.mutedLight}
              secureTextEntry
              style={styles.inputWithIcon}
            />
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={15} color={c.red} />
              <Text style={styles.error}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            disabled={busy || !email || !password}
            onPress={() => void authenticate()}
            style={[styles.primary, (busy || !email || !password) && styles.dim]}
          >
            {busy ? (
              <ActivityIndicator color={c.white} />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="log-in-outline" size={19} color={c.white} />
                <Text style={styles.primaryText}>Sign in to operations</Text>
              </View>
            )}
          </Pressable>

          <Text style={styles.loginFoot}>
            Authorized staff and admin access only · {API_BASE.replace('/api/v1', '')}
          </Text>
        </View>
      </KeyboardAvoidingView>
    );
  }

  const isAdmin = user.role === 'ADMIN';
  const visiblePending = adminSection === 'dispatch' ? EMPTY_ORDERS : pending;
  const visibleActive = adminSection === 'dispatch' ? active.filter((order) => order.type === 'DELIVERY') : active;

  // Compute Badges for Admin Tabs
  const pendingReservationsCount = (reservationsQuery.data ?? []).filter((r) => r.status === 'PENDING').length;
  const pendingEventsCount = (eventsQuery.data ?? []).filter((e) => e.status === 'PENDING').length;
  const totalPendingBookings = pendingReservationsCount + pendingEventsCount;
  const undispatchedCount = dispatchQuery.data?.undispatchedOrders?.length || 0;

  const adminNavTabs = [
    { id: 'overview' as const, title: 'Overview', icon: 'grid-outline' as const, badge: 0 },
    { id: 'orders' as const, title: 'Orders', icon: 'receipt-outline' as const, badge: pending.length, badgeUrgent: true },
    { id: 'dispatch' as const, title: 'Delivery', icon: 'bicycle-outline' as const, badge: undispatchedCount },
    { id: 'menu' as const, title: 'Menu', icon: 'restaurant-outline' as const, badge: 0 },
    { id: 'bookings' as const, title: 'Bookings', icon: 'calendar-outline' as const, badge: totalPendingBookings },
    { id: 'riders' as const, title: 'Riders', icon: 'people-outline' as const, badge: 0 },
  ];

  const isNetworkOffline = ordersQuery.isError || dispatchQuery.isError;

  return (
    <View style={styles.screen}>
      {/* Background Audio Player & Vibration Driver */}
      <OrderAlarm
        active={isAlarmRinging}
        vibrate={vibrationEnabled}
        testSignal={testSignal}
        onAutoplayBlockedChange={setWebAutoplayBlocked}
      />

      {/* Main Operations Header */}
      <View style={styles.header}>
        <View style={styles.brandGroup}>
          <View style={styles.brandMark}>
            <Image
              source={require('../../assets/images/app-icon.png')}
              style={styles.headerLogoImage}
              resizeMode="contain"
            />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.brand}>PURPLE HAZE</Text>
              <View style={[styles.liveIndicator, isNetworkOffline && styles.liveIndicatorOffline]} />
              <View style={styles.roleTag}>
                <Text style={styles.roleTagText}>{isAdmin ? 'ADMIN' : 'STAFF'}</Text>
              </View>
            </View>
            <Text style={styles.subBrand}>
              {isAdmin ? 'RESTAURANT MANAGEMENT SUITE' : 'KITCHEN & ORDER DISPATCH'}
            </Text>
          </View>
        </View>

        <View style={styles.headerRightActions}>
          {/* Master Sound Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Sound ${masterSoundEnabled ? 'on' : 'muted'}`}
            onPress={() => setMasterSoundEnabled((v) => !v)}
            style={[styles.soundButton, !masterSoundEnabled && styles.soundMuted]}
          >
            <Ionicons
              name={masterSoundEnabled ? 'volume-high' : 'volume-mute'}
              size={17}
              color={masterSoundEnabled ? c.gold : c.white}
            />
            <Text style={styles.soundLabel}>{masterSoundEnabled ? 'SOUND' : 'MUTED'}</Text>
          </Pressable>

          {/* Alert Settings & Diagnostics Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open alert settings and diagnostics"
            onPress={() => setSettingsModalVisible(true)}
            style={styles.iconButton}
            hitSlop={8}
          >
            <Ionicons name="notifications-outline" size={19} color={c.white} />
          </Pressable>

          {/* Sign Out */}
          <Pressable
            onPress={() => {
              Alert.alert('Sign out', 'Are you sure you want to log out of the operations desk?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
              ]);
            }}
            hitSlop={10}
            style={styles.logout}
          >
            <Ionicons name="log-out-outline" size={20} color="#D8CBE4" />
          </Pressable>
        </View>
      </View>

      {/* Admin Tab Navigation with Notification Badges */}
      {isAdmin && (
        <View style={styles.adminNavWrap}>
          <ScrollView
            horizontal
            style={styles.adminNavScroll}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.adminNav}
          >
            {adminNavTabs.map((item) => {
              const isActive = adminSection === item.id;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  key={item.id}
                  onPress={() => setAdminSection(item.id)}
                  style={[styles.adminNavItem, isActive && styles.adminNavItemActive]}
                >
                  <Ionicons
                    name={item.icon}
                    size={16}
                    color={isActive ? c.white : '#D7C8E2'}
                  />
                  <Text style={[styles.adminNavText, isActive && styles.adminNavTextActive]}>
                    {item.title}
                  </Text>
                  {item.badge > 0 ? (
                    <View style={[styles.tabBadge, item.badgeUrgent ? styles.tabBadgeUrgent : styles.tabBadgeNormal]}>
                      <Text style={styles.tabBadgeText}>{item.badge}</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Global Urgent Order Alert Bar - Visible across ALL screens whenever pending orders exist */}
      <UrgentOrderBar
        pendingOrders={pending}
        isAlarmRinging={isAlarmRinging}
        isAlarmSnoozed={isAlarmSnoozed}
        masterSoundEnabled={masterSoundEnabled}
        onSnoozeAlarm={handleSnoozeCurrentAlarm}
        onOpenOrders={() => setAdminSection('orders')}
        onOpenSoundSettings={() => setSettingsModalVisible(true)}
      />

      {/* Network Disconnection Banner */}
      {isNetworkOffline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline" size={18} color={c.white} />
          <View style={{ flex: 1 }}>
            <Text style={styles.offlineTitle}>RESTAURANT OFFLINE · NO LIVE ORDERS</Text>
            <Text style={styles.offlineSub}>Connection to server lost. Reconnecting order stream automatically.</Text>
          </View>
          <Pressable
            onPress={() => {
              void ordersQuery.refetch();
              void dispatchQuery.refetch();
            }}
            style={styles.reconnectBtn}
          >
            <Text style={styles.reconnectBtnText}>Reconnect Now</Text>
          </Pressable>
        </View>
      )}

      {/* Web Autoplay Blocked Banner */}
      {Platform.OS === 'web' && webAutoplayBlocked && (
        <Pressable onPress={unlockWebAudio} style={styles.webAutoplayBanner}>
          <Ionicons name="volume-mute" size={17} color="#92400E" />
          <Text style={styles.webAutoplayText}>
            Audio alerts blocked by browser autoplay policy. Tap here to enable alarm sound!
          </Text>
          <View style={styles.webAutoplayPill}>
            <Text style={styles.webAutoplayPillText}>Enable Sound</Text>
          </View>
        </Pressable>
      )}

      {/* Main Screen Views */}
      {isAdmin && adminSection === 'overview' ? (
        <ScrollView>
          <AdminOverview
            report={reportQuery.data}
            loading={reportQuery.isLoading}
            error={reportQuery.isError}
            onRetry={() => void reportQuery.refetch()}
            onOpen={(section) => setAdminSection(section)}
          />
        </ScrollView>
      ) : isAdmin && ['menu', 'bookings', 'riders'].includes(adminSection) ? (
        <AdminTools section={adminSection as 'menu' | 'bookings' | 'riders'} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.welcomeRow}>
            <View style={styles.userBadgeRow}>
              <View style={styles.userAvatar}>
                <Text style={styles.userAvatarText}>
                  {(user.name || user.email).charAt(0).toUpperCase()}
                </Text>
              </View>
              <View>
                <Text style={styles.hello}>
                  Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'},
                </Text>
                <Text style={styles.staffName}>{user.name || 'Operations Team'}</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Pressable onPress={() => setSettingsModalVisible(true)} style={styles.soundQuickPill}>
                <Ionicons name="options-outline" size={15} color={c.purple} />
                <Text style={styles.soundQuickText}>Alerts</Text>
              </Pressable>
              <Pressable onPress={() => void ordersQuery.refetch()} style={styles.refresh}>
                <Ionicons name="refresh" size={15} color={c.ink} />
                <Text style={styles.refreshText}>Refresh</Text>
              </Pressable>
            </View>
          </View>

          <View style={[styles.connection, ordersQuery.isError && styles.connectionError]}>
            <View style={[styles.dot, !ordersQuery.isError && styles.dotLive]} />
            <Text style={styles.connectionText}>
              {ordersQuery.isError ? 'Connection lost · retrying…' : 'Order stream connected'} · {pushState}
            </Text>
          </View>

          {/* Enhanced 3-Column Metrics Pipeline */}
          <View style={styles.metrics}>
            <View style={[styles.metric, pending.length > 0 && styles.metricUrgent]}>
              <View style={styles.metricHeaderRow}>
                <Text style={[styles.metricNumber, pending.length > 0 && styles.metricNumberUrgent]}>
                  {pending.length}
                </Text>
                <View style={[styles.metricIconBox, pending.length > 0 ? styles.metricIconUrgent : styles.metricIconNormal]}>
                  <Ionicons name="notifications" size={16} color={pending.length > 0 ? c.red : c.purple} />
                </View>
              </View>
              <Text style={[styles.metricLabel, pending.length > 0 && styles.metricLabelUrgent]}>
                NEEDS ACCEPTANCE
              </Text>
            </View>

            <View style={styles.metric}>
              <View style={styles.metricHeaderRow}>
                <Text style={styles.metricNumber}>{preparingCount}</Text>
                <View style={styles.metricIconNormal}>
                  <Ionicons name="flame" size={16} color={c.amber} />
                </View>
              </View>
              <Text style={styles.metricLabel}>PREPARING</Text>
            </View>

            <View style={styles.metric}>
              <View style={styles.metricHeaderRow}>
                <Text style={styles.metricNumber}>{readyCount}</Text>
                <View style={styles.metricIconNormal}>
                  <Ionicons name="bicycle" size={16} color={c.green} />
                </View>
              </View>
              <Text style={styles.metricLabel}>READY / DISPATCH</Text>
            </View>
          </View>

          {/* Section: Awaiting Acceptance */}
          {adminSection !== 'dispatch' && (
            <>
              <View style={styles.sectionRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.sectionTitle}>AWAITING ACCEPTANCE</Text>
                  {pending.length > 0 ? (
                    <View style={styles.sectionUrgentBadge}>
                      <Text style={styles.sectionUrgentBadgeText}>{pending.length} Urgent</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.count}>{pending.length}</Text>
              </View>

              {ordersQuery.isLoading ? (
                <View style={styles.empty}>
                  <ActivityIndicator color={c.purple} size="large" />
                  <Text style={styles.emptyText}>Syncing live orders…</Text>
                </View>
              ) : ordersQuery.isError ? (
                <Pressable onPress={() => void ordersQuery.refetch()} style={styles.retry}>
                  <Ionicons name="refresh" size={18} color={c.red} />
                  <Text style={styles.retryText}>Could not load orders. Tap to retry.</Text>
                </Pressable>
              ) : visiblePending.length ? (
                visiblePending.map((order) => (
                  <OrderCard key={order.id} order={order} urgent onUpdate={action} busy={busy} />
                ))
              ) : (
                <View style={styles.empty}>
                  <View style={styles.emptyIconCircle}>
                    <Ionicons name="checkmark-done" size={24} color={c.green} />
                  </View>
                  <Text style={styles.emptyTitle}>All Caught Up</Text>
                  <Text style={styles.emptyText}>
                    New customer orders will sound an audible alarm and alert the team instantly.
                  </Text>
                </View>
              )}
            </>
          )}

          {/* Section: Kitchen & Dispatch */}
          <View style={[styles.sectionRow, { marginTop: 28 }]}>
            <Text style={styles.sectionTitle}>
              {adminSection === 'dispatch' ? 'DELIVERY DISPATCH BOARD' : 'KITCHEN & ACTIVE SERVICE'}
            </Text>
            <Text style={styles.count}>{visibleActive.length}</Text>
          </View>

          {visibleActive.length ? (
            visibleActive.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onUpdate={action}
                busy={busy}
                delivery={deliveriesByOrder.get(order.id)}
                onAssign={() => setAssigningOrder(order)}
              />
            ))
          ) : (
            <View style={styles.quietBox}>
              <Ionicons name="restaurant-outline" size={24} color={c.mutedLight} />
              <Text style={styles.quiet}>
                {adminSection === 'dispatch'
                  ? 'Delivery orders marked "Ready" will appear here for rider assignment.'
                  : 'Accepted kitchen orders will appear here for preparation tracking.'}
              </Text>
            </View>
          )}

          <Text style={styles.footer}>
            Purple Haze Operations · Continuous order alarms loop until acknowledged or accepted. The order queue polls automatically every 5 seconds.
          </Text>
        </ScrollView>
      )}

      {/* Rider Assignment Sheet */}
      <RiderAssignSheet
        visible={Boolean(assigningOrder)}
        orderNumber={assigningOrder?.orderNumber || ''}
        riders={ridersQuery.data ?? []}
        loading={ridersQuery.isLoading}
        error={ridersQuery.isError}
        submitting={dispatchBusy}
        onRetry={() => void ridersQuery.refetch()}
        onClose={() => setAssigningOrder(null)}
        onAssign={(rider) => {
          if (assigningOrder) void dispatch(assigningOrder, rider);
        }}
      />

      {/* New Order Alert Modal (Unmissable overlay when a fresh order arrives) */}
      <NewOrderAlertModal
        order={newOrderModal}
        onAccept={(order) => {
          void action(order, 'CONFIRMED');
        }}
        onDecline={(order) => {
          void action(order, 'CANCELLED', 'Declined by restaurant staff.');
        }}
        onDismiss={() => {
          if (newOrderModal) {
            setSnoozedOrderIds((prev) => new Set([...prev, newOrderModal.id]));
          }
          setNewOrderModal(null);
        }}
        busy={busy}
      />

      {/* Sound & Notifications Diagnostic Sheet */}
      <NotificationSettingsModal
        visible={settingsModalVisible}
        onClose={() => setSettingsModalVisible(false)}
        masterSoundEnabled={masterSoundEnabled}
        onToggleMasterSound={setMasterSoundEnabled}
        vibrationEnabled={vibrationEnabled}
        onToggleVibration={setVibrationEnabled}
        onTriggerSoundTest={() => setTestSignal((s) => s + 1)}
        pushState={pushState}
        onRefreshPush={() => void configurePush()}
        webAutoplayBlocked={webAutoplayBlocked}
        onUnlockWebAudio={unlockWebAudio}
      />
    </View>
  );
}

function OrderCard({
  order,
  urgent,
  busy,
  onUpdate,
  delivery,
  onAssign,
}: {
  order: StaffOrder;
  urgent?: boolean;
  busy: boolean;
  onUpdate: (order: StaffOrder, status: string, note?: string) => Promise<void>;
  delivery?: DispatchDelivery;
  onAssign?: () => void;
}) {
  const waitMinutes = Math.max(0, Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60_000));
  const isUrgent = urgent || order.status === 'PENDING';
  const isCritical = isUrgent && waitMinutes >= 5;
  const isWarning = isUrgent && waitMinutes >= 2 && waitMinutes < 5;

  const isDelivery = order.type === 'DELIVERY';
  const isDineIn = order.type === 'DINE_IN';

  const next =
    order.status === 'CONFIRMED'
      ? 'PREPARING'
      : order.status === 'PREPARING'
      ? 'READY'
      : order.status === 'READY' && order.type !== 'DELIVERY'
      ? 'COMPLETED'
      : null;

  const handleCallCustomer = () => {
    if (order.customerPhone) {
      void Linking.openURL(`tel:${order.customerPhone}`);
    }
  };

  return (
    <View
      style={[
        styles.orderCard,
        isUrgent && styles.orderUrgent,
        isCritical && styles.orderCritical,
      ]}
    >
      <View style={styles.orderTop}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <Text style={styles.orderNumber}>#{order.orderNumber}</Text>

            <View style={[styles.typeBadge, isDelivery ? styles.typeBadgeDelivery : styles.typeBadgeDineIn]}>
              <Ionicons
                name={isDelivery ? 'bicycle' : isDineIn ? 'restaurant' : 'bag-handle'}
                size={11}
                color={isDelivery ? c.purple : c.deep}
              />
              <Text style={[styles.typeBadgeText, isDelivery ? styles.typeBadgeTextDelivery : styles.typeBadgeTextDineIn]}>
                {order.type.replaceAll('_', ' ')}
              </Text>
            </View>

            {isCritical ? (
              <View style={styles.criticalBadge}>
                <Ionicons name="warning" size={11} color={c.white} />
                <Text style={styles.criticalBadgeText}>CRITICAL · {waitMinutes}m</Text>
              </View>
            ) : isWarning ? (
              <View style={styles.warningBadge}>
                <Text style={styles.warningBadgeText}>WAITING · {waitMinutes}m</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.orderTime}>{age(order.createdAt)}</Text>
        </View>

        <View style={[styles.statusPill, isUrgent && styles.statusUrgent, isCritical && styles.statusCritical]}>
          <Text
            style={[
              styles.statusText,
              isUrgent && styles.statusTextUrgent,
              isCritical && styles.statusTextCritical,
            ]}
          >
            {pretty(order.status)}
          </Text>
        </View>
      </View>

      <View style={styles.rule} />

      {/* Customer Info Row */}
      <View style={styles.customerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.customer}>{order.customerName}</Text>
          {order.customerPhone ? (
            <Pressable onPress={handleCallCustomer} style={styles.phoneClickable}>
              <Ionicons name="call-outline" size={12} color={c.purple} />
              <Text style={styles.detailPhone}>{order.customerPhone}</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.orderAmountBox}>
          <Text style={styles.total}>{money(order.total)}</Text>
          <View style={styles.paymentBadge}>
            <Text style={styles.paymentBadgeText}>
              {order.paymentMethod} · {order.paymentStatus}
            </Text>
          </View>
        </View>
      </View>

      {/* Location / Destination */}
      {order.deliveryAddress ? (
        <View style={styles.locationBox}>
          <Ionicons name="location-sharp" size={13} color={c.purple} />
          <Text style={styles.locationText}>{order.deliveryAddress}</Text>
        </View>
      ) : order.tableNumber ? (
        <View style={styles.locationBox}>
          <Ionicons name="restaurant-sharp" size={13} color={c.purple} />
          <Text style={styles.locationText}>Table Number: {order.tableNumber}</Text>
        </View>
      ) : null}

      {/* Order Notes */}
      {order.notes ? (
        <View style={styles.notesBox}>
          <Ionicons name="chatbubble-ellipses-outline" size={13} color={c.amber} />
          <Text style={styles.notesText}>Note: {order.notes}</Text>
        </View>
      ) : null}

      {/* Items Breakdown */}
      <View style={styles.itemsContainer}>
        {order.items?.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <View style={styles.itemLeft}>
              <View style={styles.qtyBadge}>
                <Text style={styles.qtyBadgeText}>{item.quantity}×</Text>
              </View>
              <Text style={styles.itemName}>
                {item.name}
                {item.variantName ? <Text style={styles.variantText}> ({item.variantName})</Text> : null}
              </Text>
            </View>
            <Text style={styles.itemPrice}>{money(item.lineTotal)}</Text>
          </View>
        ))}
      </View>

      {/* Actions Bar */}
      {urgent ? (
        <View style={styles.actions}>
          <Pressable
            disabled={busy}
            onPress={() => void onUpdate(order, 'CANCELLED', 'Declined by restaurant staff.')}
            style={styles.decline}
          >
            <Text style={styles.declineText}>Decline</Text>
          </Pressable>
          <Pressable
            disabled={busy}
            onPress={() => void onUpdate(order, 'CONFIRMED')}
            style={styles.accept}
          >
            <Ionicons name="checkmark-circle" size={18} color={c.white} />
            <Text style={styles.acceptText}>Accept Order</Text>
          </Pressable>
        </View>
      ) : next ? (
        <Pressable
          disabled={busy}
          onPress={() => void onUpdate(order, next)}
          style={styles.advance}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons
              name={next === 'PREPARING' ? 'flame-outline' : next === 'READY' ? 'checkmark-circle-outline' : 'bag-check-outline'}
              size={17}
              color={c.deep}
            />
            <Text style={styles.advanceText}>
              {next === 'PREPARING' ? 'Start Preparing' : next === 'READY' ? 'Mark Food Ready' : 'Complete Pickup'}
            </Text>
          </View>
          <Ionicons name="arrow-forward" size={16} color={c.purple} />
        </Pressable>
      ) : order.status === 'READY' && order.type === 'DELIVERY' ? (
        delivery && ['ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'ARRIVED_AT_CUSTOMER'].includes(delivery.deliveryStatus) ? (
          <View style={styles.dispatchStatus}>
            <Ionicons name="bicycle" size={18} color={c.purple} />
            <View style={{ flex: 1 }}>
              <Text style={styles.handoffStatus}>{pretty(delivery.deliveryStatus)}</Text>
              <Text style={styles.handoffRider}>
                Rider: {delivery.rider?.name || 'Assigned'} {delivery.rider?.phone ? `(${delivery.rider.phone})` : ''}
              </Text>
            </View>
          </View>
        ) : (
          <Pressable onPress={onAssign} style={styles.dispatchButton}>
            <Ionicons name="bicycle" size={18} color={c.white} />
            <Text style={styles.dispatchButtonText}>
              {delivery ? 'Re-assign Another Rider' : 'Assign Delivery Rider'}
            </Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.paper,
  },
  screen: {
    flex: 1,
    backgroundColor: c.paper,
  },
  header: {
    minHeight: 74,
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'ios' ? 48 : 16,
    paddingBottom: 14,
    backgroundColor: c.plum,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#361C48',
    ...shadows.md,
  },
  brandGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: '#351B44',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(245, 185, 66, 0.4)',
  },
  headerLogoImage: {
    width: 38,
    height: 38,
  },
  brand: {
    color: c.white,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  liveIndicator: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: c.green,
  },
  liveIndicatorOffline: {
    backgroundColor: c.red,
  },
  roleTag: {
    backgroundColor: '#3C1B50',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#542870',
  },
  roleTagText: {
    color: c.gold,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  subBrand: {
    color: '#D4C4E4',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 2,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  soundButton: {
    backgroundColor: '#3C1E50',
    borderRadius: radii.sm,
    paddingHorizontal: 9,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: '#4E2868',
  },
  soundMuted: {
    backgroundColor: '#564963',
    borderColor: '#6B5D7A',
  },
  soundLabel: {
    color: c.white,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    backgroundColor: '#3C1E50',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#4E2868',
  },
  logout: {
    padding: 7,
  },
  adminNavWrap: {
    height: 52,
    backgroundColor: '#1E0B2A',
    borderBottomWidth: 1,
    borderBottomColor: '#2E153E',
  },
  adminNavScroll: {
    flexGrow: 0,
  },
  adminNav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
  },
  adminNavItem: {
    height: 36,
    minWidth: 84,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#2D143D',
  },
  adminNavItemActive: {
    backgroundColor: c.purple,
    ...shadows.sm,
  },
  adminNavText: {
    color: '#D7C8E2',
    fontSize: 10,
    fontWeight: '800',
  },
  adminNavTextActive: {
    color: c.white,
  },
  tabBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeUrgent: {
    backgroundColor: c.red,
  },
  tabBadgeNormal: {
    backgroundColor: c.gold,
  },
  tabBadgeText: {
    color: c.white,
    fontSize: 9,
    fontWeight: '900',
  },
  offlineBanner: {
    backgroundColor: '#C53030',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  offlineTitle: {
    color: c.white,
    fontSize: 11,
    fontWeight: '900',
  },
  offlineSub: {
    color: '#FED7D7',
    fontSize: 9,
    marginTop: 1,
  },
  reconnectBtn: {
    backgroundColor: c.white,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.xs,
  },
  reconnectBtnText: {
    color: '#9B2C2C',
    fontSize: 10,
    fontWeight: '900',
  },
  webAutoplayBanner: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 16,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
  },
  webAutoplayText: {
    color: '#92400E',
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
  },
  webAutoplayPill: {
    backgroundColor: '#D97706',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.xs,
  },
  webAutoplayPillText: {
    color: c.white,
    fontSize: 9,
    fontWeight: '900',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  welcomeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  userBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  userAvatar: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: c.plum,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    color: c.gold,
    fontSize: 16,
    fontWeight: '900',
  },
  hello: {
    color: c.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  staffName: {
    color: c.plum,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 1,
  },
  soundQuickPill: {
    height: 36,
    paddingHorizontal: 10,
    borderRadius: radii.sm,
    backgroundColor: c.lavender,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  soundQuickText: {
    color: c.purple,
    fontSize: 11,
    fontWeight: '800',
  },
  refresh: {
    height: 36,
    paddingHorizontal: 11,
    borderRadius: radii.sm,
    backgroundColor: c.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: c.border,
    ...shadows.sm,
  },
  refreshText: {
    color: c.ink,
    fontSize: 11,
    fontWeight: '800',
  },
  connection: {
    marginTop: 12,
    padding: 10,
    borderRadius: radii.sm,
    backgroundColor: '#E8F5ED',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  connectionError: {
    backgroundColor: '#FFF1ED',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: c.red,
  },
  dotLive: {
    backgroundColor: c.green,
  },
  connectionText: {
    flex: 1,
    color: c.muted,
    fontSize: 10,
    fontWeight: '600',
  },
  metrics: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  metric: {
    flex: 1,
    minHeight: 88,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: c.white,
    borderWidth: 1,
    borderColor: c.border,
    justifyContent: 'space-between',
    ...shadows.sm,
  },
  metricUrgent: {
    borderColor: '#F0C9C5',
    backgroundColor: '#FFF8F6',
    borderWidth: 1.5,
  },
  metricHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metricNumber: {
    color: c.plum,
    fontSize: 26,
    fontWeight: '900',
  },
  metricNumberUrgent: {
    color: c.red,
  },
  metricIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricIconNormal: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: c.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricIconUrgent: {
    backgroundColor: '#FFE9E6',
  },
  metricLabel: {
    color: c.muted,
    fontSize: 8,
    letterSpacing: 0.8,
    fontWeight: '900',
    marginTop: 4,
  },
  metricLabelUrgent: {
    color: c.redDark,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 8,
  },
  sectionTitle: {
    color: c.inkSecondary,
    fontSize: 11,
    letterSpacing: 1.1,
    fontWeight: '900',
  },
  sectionUrgentBadge: {
    backgroundColor: '#FDE8E8',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  sectionUrgentBadgeText: {
    color: c.red,
    fontSize: 9,
    fontWeight: '900',
  },
  count: {
    color: c.purple,
    fontSize: 12,
    fontWeight: '900',
  },
  orderCard: {
    backgroundColor: c.white,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radii.lg,
    padding: 16,
    marginTop: 10,
    ...shadows.sm,
  },
  orderUrgent: {
    borderColor: '#E6B7B2',
    borderWidth: 1.5,
  },
  orderCritical: {
    borderColor: c.red,
    borderWidth: 2,
  },
  orderTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  orderNumber: {
    color: c.plum,
    fontSize: 18,
    fontWeight: '900',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeBadgeDelivery: {
    backgroundColor: c.lavender,
  },
  typeBadgeDineIn: {
    backgroundColor: '#F1EBF7',
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: '900',
  },
  typeBadgeTextDelivery: {
    color: c.purple,
  },
  typeBadgeTextDineIn: {
    color: c.deep,
  },
  criticalBadge: {
    backgroundColor: c.red,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  criticalBadgeText: {
    color: c.white,
    fontSize: 9,
    fontWeight: '900',
  },
  warningBadge: {
    backgroundColor: '#ED8936',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  warningBadgeText: {
    color: c.white,
    fontSize: 9,
    fontWeight: '900',
  },
  orderTime: {
    color: c.muted,
    fontSize: 10,
    marginTop: 3,
  },
  statusPill: {
    backgroundColor: c.lavender,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  statusUrgent: {
    backgroundColor: '#FBE8E5',
  },
  statusCritical: {
    backgroundColor: '#FFD6D0',
  },
  statusText: {
    color: c.deep,
    fontSize: 9,
    fontWeight: '900',
  },
  statusTextUrgent: {
    color: c.red,
  },
  statusTextCritical: {
    color: '#8A0F21',
  },
  rule: {
    height: 1,
    backgroundColor: '#F0EAF5',
    marginVertical: 12,
  },
  customerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  customer: {
    color: c.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  phoneClickable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
    alignSelf: 'flex-start',
  },
  detailPhone: {
    color: c.purple,
    fontSize: 11,
    fontWeight: '700',
  },
  orderAmountBox: {
    alignItems: 'flex-end',
  },
  total: {
    color: c.plum,
    fontSize: 16,
    fontWeight: '900',
  },
  paymentBadge: {
    backgroundColor: c.paper,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    marginTop: 2,
  },
  paymentBadgeText: {
    color: c.muted,
    fontSize: 9,
    fontWeight: '700',
  },
  locationBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: radii.sm,
    backgroundColor: '#F7F3FA',
    marginTop: 10,
  },
  locationText: {
    color: c.deep,
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
  },
  notesBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: radii.sm,
    backgroundColor: '#FFF9E6',
    marginTop: 8,
  },
  notesText: {
    color: c.amber,
    fontSize: 11,
    fontWeight: '600',
    fontStyle: 'italic',
    flex: 1,
  },
  itemsContainer: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F5F0F8',
    paddingTop: 8,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  itemLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  qtyBadge: {
    backgroundColor: c.lavender,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  qtyBadgeText: {
    color: c.purple,
    fontSize: 10,
    fontWeight: '900',
  },
  itemName: {
    color: c.ink,
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  variantText: {
    color: c.muted,
    fontStyle: 'italic',
  },
  itemPrice: {
    color: c.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  decline: {
    borderWidth: 1.5,
    borderColor: '#E7C3C0',
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineText: {
    color: c.red,
    fontWeight: '900',
    fontSize: 12,
  },
  accept: {
    flex: 1,
    backgroundColor: c.purple,
    borderRadius: radii.md,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    ...shadows.sm,
  },
  acceptText: {
    color: c.white,
    fontWeight: '900',
    fontSize: 13,
  },
  advance: {
    marginTop: 12,
    borderRadius: radii.md,
    backgroundColor: c.lavender,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  advanceText: {
    color: c.deep,
    fontSize: 12,
    fontWeight: '900',
  },
  dispatchStatus: {
    marginTop: 10,
    padding: 11,
    borderRadius: radii.md,
    backgroundColor: c.lavender,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  handoffStatus: {
    color: c.purple,
    fontSize: 11,
    fontWeight: '900',
  },
  handoffRider: {
    color: c.muted,
    fontSize: 10,
    marginTop: 1,
  },
  dispatchButton: {
    marginTop: 12,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: radii.md,
    backgroundColor: c.purple,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...shadows.sm,
  },
  dispatchButtonText: {
    color: c.white,
    fontSize: 12,
    fontWeight: '900',
  },
  empty: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
    gap: 6,
    backgroundColor: c.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: c.border,
    ...shadows.sm,
  },
  emptyIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E8F5ED',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    color: c.plum,
    fontWeight: '900',
    fontSize: 15,
  },
  emptyText: {
    color: c.muted,
    fontSize: 11,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 16,
  },
  retry: {
    padding: 16,
    borderRadius: radii.md,
    backgroundColor: c.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  retryText: {
    color: c.red,
    textAlign: 'center',
    fontWeight: '800',
  },
  quietBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 6,
  },
  quiet: {
    color: c.muted,
    fontSize: 11,
    textAlign: 'center',
  },
  footer: {
    marginTop: 24,
    color: c.muted,
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
  },
  login: {
    flex: 1,
    minHeight: '100%',
    backgroundColor: c.plum,
    justifyContent: 'center',
    padding: 20,
  },
  loginCard: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    padding: 26,
    borderRadius: radii.xl,
    backgroundColor: c.paper,
    ...shadows.lg,
  },
  logoBadgeContainer: {
    width: 68,
    height: 68,
    borderRadius: radii.lg,
    overflow: 'hidden',
    alignSelf: 'center',
    backgroundColor: c.white,
    ...shadows.md,
    marginBottom: 16,
  },
  logoImage: {
    width: 68,
    height: 68,
  },
  loginKickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 4,
  },
  opsTag: {
    backgroundColor: c.plum,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  opsTagText: {
    color: c.gold,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  kicker: {
    color: c.purple,
    fontSize: 9,
    letterSpacing: 1.4,
    fontWeight: '900',
  },
  loginTitle: {
    color: c.plum,
    fontSize: 26,
    fontWeight: '900',
    marginTop: 5,
  },
  loginSub: {
    color: c.muted,
    fontSize: 12,
    marginTop: 5,
    marginBottom: 18,
    lineHeight: 17,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderWidth: 1.5,
    borderColor: c.border,
    backgroundColor: c.white,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    marginTop: 10,
  },
  inputIcon: {
    marginRight: 8,
  },
  inputWithIcon: {
    flex: 1,
    color: c.ink,
    fontSize: 13,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF1ED',
    padding: 9,
    borderRadius: radii.sm,
    marginTop: 10,
  },
  error: {
    color: c.red,
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  primary: {
    marginTop: 16,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: c.purple,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  dim: {
    opacity: 0.55,
  },
  primaryText: {
    color: c.white,
    fontWeight: '900',
    fontSize: 13,
  },
  loginFoot: {
    color: c.muted,
    fontSize: 9,
    marginTop: 16,
    textAlign: 'center',
  },
});
