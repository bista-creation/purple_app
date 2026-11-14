import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { palette as c } from '../theme/tokens';
import { sendTestNotification } from '../services/notifications';

type Props = {
  visible: boolean;
  onClose: () => void;
  masterSoundEnabled: boolean;
  onToggleMasterSound: (value: boolean) => void;
  vibrationEnabled: boolean;
  onToggleVibration: (value: boolean) => void;
  onTriggerSoundTest: () => void;
  pushState: string;
  onRefreshPush: () => void;
  webAutoplayBlocked?: boolean;
  onUnlockWebAudio?: () => void;
};

export default function NotificationSettingsModal({
  visible,
  onClose,
  masterSoundEnabled,
  onToggleMasterSound,
  vibrationEnabled,
  onToggleVibration,
  onTriggerSoundTest,
  pushState,
  onRefreshPush,
  webAutoplayBlocked,
  onUnlockWebAudio,
}: Props) {
  const [testingNotification, setTestingNotification] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const handleTestSystemNotification = async () => {
    setTestingNotification(true);
    setTestResult(null);
    try {
      const ok = await sendTestNotification();
      setTestResult(
        ok
          ? '✓ Test alert dispatched! Check your notification bar and lockscreen.'
          : '⚠️ Could not dispatch local notification. Check permissions.'
      );
    } catch {
      setTestResult('⚠️ Test notification failed.');
    } finally {
      setTestingNotification(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.headerIcon}>
                <Ionicons name="volume-high" size={20} color={c.gold} />
              </View>
              <View>
                <Text style={styles.kicker}>AUDIO & NOTIFICATIONS</Text>
                <Text style={styles.title}>Alerts & Sound Control</Text>
              </View>
            </View>
            <Pressable hitSlop={10} onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={c.ink} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            {/* Web Autoplay Block Warning */}
            {Platform.OS === 'web' && webAutoplayBlocked ? (
              <View style={styles.webWarning}>
                <Ionicons name="warning" size={20} color={c.amber} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.webWarningTitle}>Browser Audio Locked</Text>
                  <Text style={styles.webWarningBody}>
                    Your browser blocks audio autoplay until you interact with the page.
                  </Text>
                </View>
                <Pressable onPress={onUnlockWebAudio} style={styles.unlockBtn}>
                  <Text style={styles.unlockBtnText}>Enable Audio</Text>
                </Pressable>
              </View>
            ) : null}

            {/* Quick Controls Section */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>LIVE SERVICE SOUND CONTROLS</Text>

              <View style={styles.settingRow}>
                <View style={styles.settingCopy}>
                  <Text style={styles.settingLabel}>Master Alert Sound</Text>
                  <Text style={styles.settingDesc}>
                    Continuous looping audio alarm when new orders arrive
                  </Text>
                </View>
                <Switch
                  value={masterSoundEnabled}
                  onValueChange={onToggleMasterSound}
                  trackColor={{ false: '#DDD', true: c.purple }}
                  thumbColor={c.white}
                />
              </View>

              <View style={[styles.settingRow, styles.rowBorder]}>
                <View style={styles.settingCopy}>
                  <Text style={styles.settingLabel}>Urgent Vibration (Haptics)</Text>
                  <Text style={styles.settingDesc}>
                    Pulsing vibration alert when orders need acceptance
                  </Text>
                </View>
                <Switch
                  value={vibrationEnabled}
                  onValueChange={onToggleVibration}
                  trackColor={{ false: '#DDD', true: c.purple }}
                  thumbColor={c.white}
                />
              </View>
            </View>

            {/* Device Readiness Test Section */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>DIAGNOSTICS & HARDWARE TESTS</Text>
              <Text style={styles.cardHelp}>
                Test before peak hours so your counter staff and kitchen never miss an order.
              </Text>

              <View style={styles.testActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={onTriggerSoundTest}
                  style={styles.testBtn}
                >
                  <Ionicons name="play" size={16} color={c.purple} />
                  <Text style={styles.testBtnText}>Test Alarm Sound (3s)</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  disabled={testingNotification}
                  onPress={handleTestSystemNotification}
                  style={styles.testBtn}
                >
                  {testingNotification ? (
                    <ActivityIndicator size="small" color={c.purple} />
                  ) : (
                    <Ionicons name="notifications" size={16} color={c.purple} />
                  )}
                  <Text style={styles.testBtnText}>Test System Push Alert</Text>
                </Pressable>
              </View>

              {testResult ? <Text style={styles.testResult}>{testResult}</Text> : null}
            </View>

            {/* System Push Channel Info */}
            <View style={styles.card}>
              <View style={styles.pushHeader}>
                <Text style={styles.cardTitle}>SYSTEM PUSH & CHANNELS</Text>
                <Pressable onPress={onRefreshPush} style={styles.refreshPill}>
                  <Ionicons name="refresh" size={12} color={c.purple} />
                  <Text style={styles.refreshPillText}>Check Push</Text>
                </Pressable>
              </View>

              <View style={styles.statusBox}>
                <View style={[styles.statusDot, pushState.includes('active') ? styles.dotGreen : styles.dotAmber]} />
                <Text style={styles.statusText}>{pushState}</Text>
              </View>

              <View style={styles.channelList}>
                <View style={styles.channelItem}>
                  <Ionicons name="radio-button-on" size={14} color={c.green} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.channelName}>incoming-orders (Max Priority)</Text>
                    <Text style={styles.channelSub}>Custom order tone · Bypasses DND · Alarm stream</Text>
                  </View>
                </View>

                <View style={styles.channelItem}>
                  <Ionicons name="radio-button-on" size={14} color={c.purple} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.channelName}>order-updates (High Priority)</Text>
                    <Text style={styles.channelSub}>Rider dispatched · Ready for pickup</Text>
                  </View>
                </View>

                <View style={styles.channelItem}>
                  <Ionicons name="radio-button-on" size={14} color={c.gold} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.channelName}>booking-alerts (High Priority)</Text>
                    <Text style={styles.channelSub}>New reservations & event bookings</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Android Reliability Best Practice Banner */}
            {Platform.OS === 'android' ? (
              <View style={styles.infoBanner}>
                <Ionicons name="information-circle" size={18} color={c.purple} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoTitle}>Android Restaurant Tip</Text>
                  <Text style={styles.infoBody}>
                    To prevent Android from sleeping the app during service, go to Android Settings → Apps → Purple Haze Operations → Battery → Select "Unrestricted".
                  </Text>
                </View>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable onPress={onClose} style={styles.doneBtn}>
              <Text style={styles.doneBtnText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: c.paper,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '88%',
    width: '100%',
    maxWidth: 650,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    backgroundColor: c.white,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: c.plum,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kicker: {
    color: c.purple,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  title: {
    color: c.plum,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  body: {
    padding: 16,
    gap: 12,
  },
  webWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFF8E1',
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  webWarningTitle: {
    color: c.amber,
    fontSize: 12,
    fontWeight: '900',
  },
  webWarningBody: {
    color: '#6D4C41',
    fontSize: 10,
    marginTop: 2,
  },
  unlockBtn: {
    backgroundColor: c.amber,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  unlockBtnText: {
    color: c.white,
    fontSize: 10,
    fontWeight: '900',
  },
  card: {
    backgroundColor: c.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: c.border,
  },
  cardTitle: {
    color: c.muted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 8,
  },
  cardHelp: {
    color: c.muted,
    fontSize: 11,
    marginBottom: 12,
    lineHeight: 16,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  rowBorder: {
    borderTopWidth: 1,
    borderTopColor: '#F2EDF7',
    marginTop: 6,
    paddingTop: 12,
  },
  settingCopy: {
    flex: 1,
    paddingRight: 12,
  },
  settingLabel: {
    color: c.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  settingDesc: {
    color: c.muted,
    fontSize: 10,
    marginTop: 2,
  },
  testActions: {
    flexDirection: 'row',
    gap: 9,
    flexWrap: 'wrap',
  },
  testBtn: {
    flex: 1,
    minWidth: 140,
    height: 42,
    borderRadius: 10,
    backgroundColor: c.lavender,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  testBtnText: {
    color: c.purple,
    fontSize: 11,
    fontWeight: '900',
  },
  testResult: {
    color: c.green,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 10,
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#E8F5ED',
  },
  pushHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  refreshPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor: c.lavender,
  },
  refreshPillText: {
    color: c.purple,
    fontSize: 9,
    fontWeight: '800',
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    padding: 9,
    borderRadius: 9,
    backgroundColor: '#F8F6FA',
    marginTop: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotGreen: {
    backgroundColor: c.green,
  },
  dotAmber: {
    backgroundColor: c.amber,
  },
  statusText: {
    color: c.ink,
    fontSize: 10,
    fontWeight: '600',
    flex: 1,
  },
  channelList: {
    marginTop: 12,
    gap: 9,
  },
  channelItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 4,
  },
  channelName: {
    color: c.ink,
    fontSize: 11,
    fontWeight: '800',
  },
  channelSub: {
    color: c.muted,
    fontSize: 9,
    marginTop: 1,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: c.lavender,
    borderWidth: 1,
    borderColor: '#D7C7EA',
  },
  infoTitle: {
    color: c.purple,
    fontSize: 11,
    fontWeight: '900',
  },
  infoBody: {
    color: c.deep,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 2,
  },
  footer: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: c.border,
    backgroundColor: c.white,
  },
  doneBtn: {
    height: 44,
    borderRadius: 11,
    backgroundColor: c.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    color: c.white,
    fontSize: 13,
    fontWeight: '900',
  },
});
