import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  AndroidAudioContentType,
  AndroidAudioUsage,
  AndroidImportance,
  AndroidNotificationVisibility,
} from 'expo-notifications';
import Constants from 'expo-constants';
import { registerPushToken, unregisterPushToken, type StaffOrder } from './api';

const money = (paisa: number) => `Rs ${Math.round(paisa / 100).toLocaleString('en-IN')}`;

export const CHANNEL_INCOMING_ORDERS = 'incoming-orders';
export const CHANNEL_ORDER_UPDATES = 'order-updates';
export const CHANNEL_BOOKINGS = 'booking-alerts';

// Track already alerted order IDs in memory so we do not spam repeated local notifications for the same order
const alertedOrderIds = new Set<string>();

/**
 * Configure global handler for incoming notifications while app is in foreground
 */
export function initNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data;
      const trigger = notification.request.trigger;
      const isUrgent =
        data?.type === 'INCOMING_ORDER' ||
        (trigger && typeof trigger === 'object' && 'channelId' in trigger && trigger.channelId === CHANNEL_INCOMING_ORDERS);

      return {
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: Boolean(isUrgent),
        shouldSetBadge: true,
      };
    },
  });
}

/**
 * Configure high-priority Android notification channels with Zomato/UberEats style alarm properties
 */
export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    // 1. Channel for urgent incoming orders - loud custom tone, alarm usage, bypass DND
    await Notifications.setNotificationChannelAsync(CHANNEL_INCOMING_ORDERS, {
      name: 'Urgent Incoming Orders (Zomato Alarm)',
      description: 'High-urgency continuous alarm for incoming restaurant orders',
      importance: AndroidImportance.MAX,
      vibrationPattern: [0, 800, 300, 800, 300, 1000],
      lightColor: '#F5B942',
      sound: 'order_alert.wav',
      audioAttributes: {
        usage: AndroidAudioUsage.ALARM,
        contentType: AndroidAudioContentType.SONIFICATION,
        flags: {
          enforceAudibility: true,
          requestHardwareAudioVideoSynchronization: false,
        },
      },
      enableLights: true,
      enableVibrate: true,
      lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
      showBadge: true,
    });

    // 2. Channel for status changes and delivery dispatch updates
    await Notifications.setNotificationChannelAsync(CHANNEL_ORDER_UPDATES, {
      name: 'Order & Delivery Updates',
      description: 'Status updates for preparation, kitchen ready, and rider delivery',
      importance: AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 350, 150, 350],
      lightColor: '#6B2DBD',
      enableLights: true,
      enableVibrate: true,
      lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
    });

    // 3. Channel for table reservations and event bookings
    await Notifications.setNotificationChannelAsync(CHANNEL_BOOKINGS, {
      name: 'Reservations & Event Enquiries',
      description: 'Alerts for incoming table reservations and large event bookings',
      importance: AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 400, 200, 400],
      lightColor: '#F5B942',
      enableLights: true,
      enableVibrate: true,
      lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
    });
  } catch (err) {
    console.warn('[notifications] Failed to configure Android channels:', err);
  }
}

/**
 * Schedule immediate local system notification for a newly arrived order.
 * Ensures staff gets a notification even if push token is failing or app is backgrounded.
 */
export async function scheduleLocalOrderAlert(order: StaffOrder): Promise<void> {
  if (alertedOrderIds.has(order.id)) return;
  alertedOrderIds.add(order.id);

  try {
    const itemCount = order.items?.reduce((acc, it) => acc + it.quantity, 0) || order.items?.length || 1;
    const orderType = order.type.replaceAll('_', ' ');

    await Notifications.scheduleNotificationAsync({
      identifier: `order-${order.id}`,
      content: {
        title: `🔔 NEW ORDER #${order.orderNumber}`,
        subtitle: `${orderType} · ${money(order.total)}`,
        body: `${order.customerName} (${itemCount} items) · Needs quick staff acceptance`,
        sound: 'order_alert.wav',
        priority: 'max',
        color: '#B42338',
        sticky: true,
        autoDismiss: false,
        data: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          type: 'INCOMING_ORDER',
        },
      },
      trigger: Platform.OS === 'android' ? { channelId: CHANNEL_INCOMING_ORDERS } : null,
    });
  } catch (err) {
    console.warn('[notifications] Could not schedule local order alert:', err);
  }
}

/**
 * Dismiss the notification for a resolved/accepted/cancelled order
 */
export async function dismissOrderAlert(orderId: string): Promise<void> {
  try {
    await Notifications.dismissNotificationAsync(`order-${orderId}`);
  } catch {
    // ignore dismissal error
  }
}

/**
 * Dismiss all active notifications
 */
export async function dismissAllOrderAlerts(): Promise<void> {
  try {
    await Notifications.dismissAllNotificationsAsync();
  } catch {
    // ignore
  }
}

/**
 * Trigger an instant test notification so staff can check lock screen visibility, sound, and vibration
 */
export async function sendTestNotification(): Promise<boolean> {
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: `test-order-${Date.now()}`,
      content: {
        title: '🔔 TEST ORDER ALARM · #999',
        subtitle: 'DINE IN · Rs 1,450',
        body: 'Test Alert: Order desk notification channel is active. If you hear the alert tone and feel vibration, your device is ready for service!',
        sound: 'order_alert.wav',
        priority: 'max',
        color: '#F5B942',
        data: { type: 'INCOMING_ORDER', isTest: true },
      },
      trigger: Platform.OS === 'android' ? { channelId: CHANNEL_INCOMING_ORDERS } : null,
    });
    return true;
  } catch (err) {
    console.warn('[notifications] Failed to send test notification:', err);
    return false;
  }
}

/**
 * Register push token with backend and return diagnostic status string
 */
export async function registerPushForStaff(): Promise<{ ok: boolean; status: string; token?: string }> {
  if (Platform.OS === 'web') {
    return { ok: true, status: 'Browser preview · live queue & web audio active' };
  }

  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    return { ok: false, status: 'Live queue on · add EAS project ID for remote push' };
  }

  try {
    await setupNotificationChannels();
    const permission = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });

    if (!permission.granted) {
      return { ok: false, status: 'Notifications disabled in device settings' };
    }

    const pushTokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = pushTokenData.data;

    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    await registerPushToken(token, platform);

    return { ok: true, status: 'Push active · live queue backup connected', token };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[notifications] Push registration error:', msg);
    return { ok: false, status: 'Push needs development build · live queue backup active' };
  }
}
