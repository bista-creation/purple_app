import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AdminReport } from '../services/api';
import { palette as c, radii, shadows } from '../theme/tokens';

type Section = 'overview' | 'orders' | 'dispatch' | 'menu' | 'bookings' | 'riders';

type Props = {
  report?: AdminReport;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onOpen: (section: Section) => void;
};

const money = (paisa: number) => `Rs ${Math.round(paisa / 100).toLocaleString('en-IN')}`;

export default function AdminOverview({ report, loading, error, onRetry, onOpen }: Props) {
  const summary = report?.summary;
  const totalBookings = (summary?.totalReservations ?? 0) + (summary?.totalEvents ?? 0);

  return (
    <View style={styles.wrap}>
      {/* Hero Header */}
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name="shield-checkmark" size={24} color={c.gold} />
        </View>
        <View style={styles.heroCopy}>
          <View style={styles.badgeRow}>
            <Text style={styles.eyebrow}>EXECUTIVE CONTROL</Text>
            <View style={styles.liveTag}>
              <View style={styles.liveTagDot} />
              <Text style={styles.liveTagText}>LIVE OPS</Text>
            </View>
          </View>
          <Text style={styles.title}>Restaurant Overview</Text>
          <Text style={styles.subtitle}>Real-time sales, live kitchen status, and bookings summary</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.state}>
          <ActivityIndicator color={c.purple} size="large" />
          <Text style={styles.stateText}>Loading operations summary…</Text>
        </View>
      ) : error ? (
        <Pressable onPress={onRetry} style={styles.error}>
          <Ionicons name="refresh" size={18} color={c.red} />
          <Text style={styles.errorText}>Could not load the overview. Tap to retry.</Text>
        </Pressable>
      ) : (
        <>
          {/* Key Metric Tiles */}
          <View style={styles.grid}>
            <Metric
              icon="receipt-outline"
              label="TOTAL ORDERS"
              value={summary?.totalOrders ?? 0}
              onPress={() => onOpen('orders')}
            />
            <Metric
              icon="flash-outline"
              label="ACTIVE ORDERS"
              value={summary?.activeOrders ?? 0}
              accent
              onPress={() => onOpen('orders')}
            />
            <Metric
              icon="cash-outline"
              label="PAID REVENUE"
              value={money(summary?.totalRevenuePaisa ?? 0)}
            />
            <Metric
              icon="calendar-outline"
              label="BOOKINGS & EVENTS"
              value={totalBookings}
              onPress={() => onOpen('bookings')}
            />
          </View>

          {/* Quick Action Navigation */}
          <View style={styles.actions}>
            <Action
              icon="receipt"
              title="Live Order Desk"
              detail="Review, accept and track orders through kitchen"
              onPress={() => onOpen('orders')}
            />
            <Action
              icon="bicycle"
              title="Delivery Dispatch"
              detail="Assign ready orders and monitor delivery fleet"
              onPress={() => onOpen('dispatch')}
            />
            <Action
              icon="calendar"
              title="Reservations & Event Bookings"
              detail="Confirm table reservations and private event enquiries"
              onPress={() => onOpen('bookings')}
            />
          </View>

          {/* Recent Orders Panel */}
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="time-outline" size={17} color={c.purple} />
                <Text style={styles.panelTitle}>Recent Orders</Text>
              </View>
              <Pressable onPress={() => onOpen('orders')} style={styles.viewLink}>
                <Text style={styles.link}>View live queue</Text>
                <Ionicons name="arrow-forward" size={12} color={c.purple} />
              </Pressable>
            </View>

            {report?.recentOrders.length ? (
              report.recentOrders.map((order) => (
                <View key={order.id} style={styles.orderRow}>
                  <View style={styles.orderIcon}>
                    <Ionicons name="receipt-outline" size={16} color={c.purple} />
                  </View>
                  <View style={styles.orderCopy}>
                    <Text style={styles.orderName}>
                      #{order.orderNumber} · {order.customerName}
                    </Text>
                    <Text style={styles.orderMeta}>
                      {order.type.replaceAll('_', ' ')} · {order.status.replaceAll('_', ' ')}
                    </Text>
                  </View>
                  <Text style={styles.orderTotal}>{money(order.total)}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.empty}>No recent orders recorded yet.</Text>
            )}
          </View>

          {/* Top Selling Dishes Panel */}
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="trophy-outline" size={17} color={c.gold} />
                <Text style={styles.panelTitle}>Top Selling Dishes</Text>
              </View>
              <Pressable onPress={() => onOpen('menu')}>
                <Text style={styles.link}>Manage menu</Text>
              </Pressable>
            </View>

            {report?.topSellingDishes.length ? (
              report.topSellingDishes.map((dish, index) => (
                <View key={`${dish.dishId ?? dish.name}-${index}`} style={styles.dishRow}>
                  <View style={[styles.rankBox, index === 0 ? styles.rankGold : index === 1 ? styles.rankSilver : styles.rankBronze]}>
                    <Text style={styles.rank}>{index + 1}</Text>
                  </View>
                  <Text style={styles.dishName}>{dish.name}</Text>
                  <View style={styles.qtyPill}>
                    <Text style={styles.dishQty}>{dish.quantitySold} sold</Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.empty}>Sales insights will appear when orders are completed.</Text>
            )}
          </View>

          <Text style={styles.note}>
            Urgent incoming orders will sound an audible alarm and trigger vibration regardless of the current view.
          </Text>
        </>
      )}
    </View>
  );
}

function Metric({
  icon,
  label,
  value,
  accent,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string | number;
  accent?: boolean;
  onPress?: () => void;
}) {
  const content = (
    <View style={[styles.metric, accent && styles.metricAccent]}>
      <View style={styles.metricTopRow}>
        <Ionicons name={icon} size={18} color={accent ? c.gold : c.purple} />
        {onPress ? (
          <Ionicons name="arrow-forward" size={12} color={accent ? '#E5D6F2' : c.mutedLight} />
        ) : null}
      </View>
      <Text style={[styles.metricValue, accent && styles.metricValueAccent]}>{value}</Text>
      <Text style={[styles.metricLabel, accent && styles.metricLabelAccent]}>{label}</Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={{ width: '48%', flexGrow: 1 }}>
        {content}
      </Pressable>
    );
  }

  return <View style={{ width: '48%', flexGrow: 1 }}>{content}</View>;
}

function Action({
  icon,
  title,
  detail,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.action}>
      <View style={styles.actionIcon}>
        <Ionicons name={icon} size={19} color={c.purple} />
      </View>
      <Text style={styles.actionTitle}>{title}</Text>
      <Text style={styles.actionDetail}>{detail}</Text>
      <Ionicons name="arrow-forward" size={16} color={c.purple} style={styles.actionArrow} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: 16,
    paddingBottom: 40,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: radii.xl,
    backgroundColor: c.plum,
    borderWidth: 1,
    borderColor: '#391C4C',
    ...shadows.md,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: '#351945',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(245, 185, 66, 0.3)',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eyebrow: {
    color: c.gold,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(30, 126, 82, 0.4)',
  },
  liveTagDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#48BB78',
  },
  liveTagText: {
    color: '#9AE6B4',
    fontSize: 8,
    fontWeight: '900',
  },
  heroCopy: {
    flex: 1,
  },
  title: {
    color: c.white,
    fontSize: 21,
    fontWeight: '900',
    marginTop: 3,
  },
  subtitle: {
    color: '#D7C8E2',
    fontSize: 11,
    marginTop: 3,
    lineHeight: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  metric: {
    minHeight: 104,
    borderRadius: radii.lg,
    padding: 14,
    backgroundColor: c.white,
    borderWidth: 1,
    borderColor: c.border,
    justifyContent: 'space-between',
    ...shadows.sm,
  },
  metricAccent: {
    backgroundColor: c.purple,
    borderColor: c.purple,
  },
  metricTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metricValue: {
    color: c.plum,
    fontSize: 24,
    fontWeight: '900',
    marginTop: 6,
  },
  metricValueAccent: {
    color: c.white,
  },
  metricLabel: {
    color: c.muted,
    fontSize: 9,
    letterSpacing: 0.8,
    fontWeight: '900',
    marginTop: 4,
  },
  metricLabelAccent: {
    color: '#E8DDF1',
  },
  actions: {
    gap: 9,
    marginTop: 14,
  },
  action: {
    minHeight: 68,
    padding: 12,
    paddingLeft: 54,
    justifyContent: 'center',
    backgroundColor: c.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: c.border,
    ...shadows.sm,
  },
  actionIcon: {
    position: 'absolute',
    left: 14,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: c.lavender,
  },
  actionTitle: {
    color: c.plum,
    fontWeight: '900',
    fontSize: 13,
  },
  actionDetail: {
    color: c.muted,
    fontSize: 10,
    marginTop: 2,
  },
  actionArrow: {
    position: 'absolute',
    right: 14,
    top: 26,
  },
  panel: {
    marginTop: 14,
    padding: 16,
    borderRadius: radii.lg,
    backgroundColor: c.white,
    borderWidth: 1,
    borderColor: c.border,
    ...shadows.sm,
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  panelTitle: {
    color: c.plum,
    fontSize: 13,
    fontWeight: '900',
  },
  viewLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  link: {
    color: c.purple,
    fontSize: 11,
    fontWeight: '800',
  },
  orderRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: '#F3EEF7',
    gap: 10,
    paddingVertical: 4,
  },
  orderIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: c.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderCopy: {
    flex: 1,
  },
  orderName: {
    color: c.ink,
    fontSize: 12,
    fontWeight: '800',
  },
  orderMeta: {
    color: c.muted,
    fontSize: 9,
    marginTop: 2,
  },
  orderTotal: {
    color: c.plum,
    fontSize: 12,
    fontWeight: '900',
  },
  dishRow: {
    minHeight: 42,
    borderTopWidth: 1,
    borderColor: '#F3EEF7',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  rankBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankGold: {
    backgroundColor: '#FEF3C7',
  },
  rankSilver: {
    backgroundColor: '#F1F5F9',
  },
  rankBronze: {
    backgroundColor: '#FFEDD5',
  },
  rank: {
    color: c.plum,
    fontSize: 10,
    fontWeight: '900',
  },
  dishName: {
    flex: 1,
    color: c.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  qtyPill: {
    backgroundColor: c.paper,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  dishQty: {
    color: c.muted,
    fontSize: 10,
    fontWeight: '700',
  },
  empty: {
    color: c.muted,
    fontSize: 11,
    paddingVertical: 14,
    textAlign: 'center',
  },
  note: {
    color: c.muted,
    fontSize: 10,
    marginTop: 16,
    textAlign: 'center',
  },
  state: {
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  stateText: {
    color: c.muted,
    fontSize: 11,
  },
  error: {
    marginTop: 14,
    padding: 16,
    backgroundColor: c.white,
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  errorText: {
    color: c.red,
    fontSize: 11,
    fontWeight: '700',
  },
});
