import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { palette as c } from '../theme/tokens';
import type { StaffOrder } from '../services/api';

type Props = {
  pendingOrders: StaffOrder[];
  isAlarmRinging: boolean;
  isAlarmSnoozed: boolean;
  masterSoundEnabled: boolean;
  onSnoozeAlarm: () => void;
  onOpenOrders: () => void;
  onOpenSoundSettings: () => void;
};

export default function UrgentOrderBar({
  pendingOrders,
  isAlarmRinging,
  isAlarmSnoozed,
  masterSoundEnabled,
  onSnoozeAlarm,
  onOpenOrders,
  onOpenSoundSettings,
}: Props) {
  const [pulse, setPulse] = useState(false);
  const [timeText, setTimeText] = useState('');

  // Find oldest pending order
  const oldestOrder = pendingOrders.reduce<StaffOrder | null>((oldest, curr) => {
    if (!oldest) return curr;
    return new Date(curr.createdAt).getTime() < new Date(oldest.createdAt).getTime() ? curr : oldest;
  }, null);

  useEffect(() => {
    if (!pendingOrders.length) return;

    const interval = setInterval(() => {
      setPulse((p) => !p);

      if (oldestOrder) {
        const elapsedSec = Math.max(0, Math.floor((Date.now() - new Date(oldestOrder.createdAt).getTime()) / 1000));
        const mins = Math.floor(elapsedSec / 60);
        const secs = elapsedSec % 60;
        if (mins < 1) {
          setTimeText(`${secs}s ago`);
        } else {
          setTimeText(`${mins}m ${secs}s ago`);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [pendingOrders.length, oldestOrder]);

  if (!pendingOrders.length) return null;

  const count = pendingOrders.length;
  const isCritical = oldestOrder && Date.now() - new Date(oldestOrder.createdAt).getTime() > 4 * 60_000;

  return (
    <View style={[styles.bar, isCritical && styles.barCritical]}>
      <View style={styles.left}>
        <View style={[styles.bell, pulse && styles.bellPulse]}>
          <Ionicons name="notifications" size={17} color={c.white} />
        </View>
        <View style={styles.copy}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>
              {count} NEW {count === 1 ? 'ORDER' : 'ORDERS'} NEED ACCEPTANCE
            </Text>
            {timeText ? (
              <View style={[styles.timePill, isCritical && styles.timePillCritical]}>
                <Text style={styles.timeText}>Oldest: {timeText}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.status}>
            {!masterSoundEnabled
              ? 'Sound muted · Tap speaker to turn on'
              : isAlarmSnoozed
              ? 'Alarm snoozed for current batch · re-arms on new order'
              : isAlarmRinging
              ? '🔔 Alarm ringing with loud alert & vibration'
              : 'Waiting for staff action'}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        {masterSoundEnabled && !isAlarmSnoozed ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Snooze current alarm"
            onPress={onSnoozeAlarm}
            style={styles.snoozeBtn}
          >
            <Ionicons name="volume-mute-outline" size={14} color={c.white} />
            <Text style={styles.snoozeText}>Snooze</Text>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View and accept orders"
          onPress={onOpenOrders}
          style={styles.viewBtn}
        >
          <Text style={styles.viewText}>View & Accept</Text>
          <Ionicons name="arrow-forward" size={14} color={c.plum} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open notification settings"
          onPress={onOpenSoundSettings}
          style={styles.settingsBtn}
          hitSlop={6}
        >
          <Ionicons name="options-outline" size={16} color="#FFE6E2" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: c.red,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#8C1525',
    gap: 10,
    zIndex: 99,
  },
  barCritical: {
    backgroundColor: '#8C1223',
    borderBottomColor: '#5C0814',
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  bell: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellPulse: {
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    transform: [{ scale: 1.08 }],
  },
  copy: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexWrap: 'wrap',
  },
  title: {
    color: c.white,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  timePill: {
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  timePillCritical: {
    backgroundColor: '#E65100',
  },
  timeText: {
    color: '#FFF0ED',
    fontSize: 9,
    fontWeight: '800',
  },
  status: {
    color: '#FFE2DC',
    fontSize: 9,
    marginTop: 2,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  snoozeBtn: {
    height: 30,
    paddingHorizontal: 9,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  snoozeText: {
    color: c.white,
    fontSize: 10,
    fontWeight: '800',
  },
  viewBtn: {
    height: 30,
    paddingHorizontal: 11,
    borderRadius: 8,
    backgroundColor: c.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewText: {
    color: c.plum,
    fontSize: 10,
    fontWeight: '900',
  },
  settingsBtn: {
    padding: 6,
    borderRadius: 7,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
});
