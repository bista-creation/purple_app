import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AdminReport } from '../services/api';
import { palette as c } from '../theme/tokens';

type Props = {
  report?: AdminReport;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onOpen: (section: 'orders' | 'dispatch') => void;
};

const money = (paisa: number) => `Rs ${Math.round(paisa / 100).toLocaleString('en-IN')}`;

export default function AdminOverview({ report, loading, error, onRetry, onOpen }: Props) {
  const summary = report?.summary;
  return <View style={styles.wrap}>
    <View style={styles.hero}>
      <View style={styles.heroIcon}><Ionicons name="shield-checkmark" size={22} color={c.gold} /></View>
      <View style={styles.heroCopy}><Text style={styles.eyebrow}>ADMIN CONTROL PANEL</Text><Text style={styles.title}>Restaurant overview</Text><Text style={styles.subtitle}>Operations and business activity at a glance</Text></View>
    </View>
    {loading ? <View style={styles.state}><ActivityIndicator color={c.purple} /><Text style={styles.stateText}>Loading restaurant summary…</Text></View> : error ? <Pressable onPress={onRetry} style={styles.error}><Text style={styles.errorText}>Could not load the overview. Tap to retry.</Text></Pressable> : <>
      <View style={styles.grid}>
        <Metric icon="receipt-outline" label="TOTAL ORDERS" value={summary?.totalOrders ?? 0} />
        <Metric icon="flash-outline" label="ACTIVE ORDERS" value={summary?.activeOrders ?? 0} accent />
        <Metric icon="cash-outline" label="PAID REVENUE" value={money(summary?.totalRevenuePaisa ?? 0)} />
        <Metric icon="calendar-outline" label="BOOKINGS" value={(summary?.totalReservations ?? 0) + (summary?.totalEvents ?? 0)} />
      </View>
      <View style={styles.actions}>
        <Action icon="receipt" title="Manage orders" detail="Review orders and status" onPress={() => onOpen('orders')} />
        <Action icon="bicycle" title="Delivery dispatch" detail="Assign and track riders" onPress={() => onOpen('dispatch')} />
      </View>
      <View style={styles.panel}>
        <View style={styles.panelHeader}><Text style={styles.panelTitle}>Recent orders</Text><Pressable onPress={() => onOpen('orders')}><Text style={styles.link}>View all</Text></Pressable></View>
        {report?.recentOrders.length ? report.recentOrders.map((order) => <View key={order.id} style={styles.orderRow}><View style={styles.orderIcon}><Ionicons name="receipt-outline" size={16} color={c.purple} /></View><View style={styles.orderCopy}><Text style={styles.orderName}>#{order.orderNumber} · {order.customerName}</Text><Text style={styles.orderMeta}>{order.type.replaceAll('_', ' ')} · {order.status.replaceAll('_', ' ')}</Text></View><Text style={styles.orderTotal}>{money(order.total)}</Text></View>) : <Text style={styles.empty}>No recent orders to show.</Text>}
      </View>
      <View style={styles.panel}>
        <View style={styles.panelHeader}><Text style={styles.panelTitle}>Top selling dishes</Text></View>
        {report?.topSellingDishes.length ? report.topSellingDishes.map((dish, index) => <View key={`${dish.dishId ?? dish.name}-${index}`} style={styles.dishRow}><Text style={styles.rank}>{index + 1}</Text><Text style={styles.dishName}>{dish.name}</Text><Text style={styles.dishQty}>{dish.quantitySold} sold</Text></View>) : <Text style={styles.empty}>Sales insights will appear when orders are completed.</Text>}
      </View>
      <Text style={styles.note}>Revenue includes paid orders. Use Orders and Delivery to handle live service.</Text>
    </>}
  </View>;
}

function Metric({ icon, label, value, accent }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string | number; accent?: boolean }) {
  return <View style={[styles.metric, accent && styles.metricAccent]}><Ionicons name={icon} size={17} color={accent ? c.white : c.purple} /><Text style={[styles.metricValue, accent && styles.metricValueAccent]}>{value}</Text><Text style={[styles.metricLabel, accent && styles.metricLabelAccent]}>{label}</Text></View>;
}

function Action({ icon, title, detail, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; detail: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.action}><View style={styles.actionIcon}><Ionicons name={icon} size={18} color={c.purple} /></View><Text style={styles.actionTitle}>{title}</Text><Text style={styles.actionDetail}>{detail}</Text><Ionicons name="arrow-forward" size={15} color={c.purple} style={styles.actionArrow} /></Pressable>;
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 34, maxWidth: 700, width: '100%', alignSelf: 'center' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 17, borderRadius: 17, backgroundColor: c.plum },
  heroIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: '#43235D', alignItems: 'center', justifyContent: 'center' },
  heroCopy: { flex: 1 }, eyebrow: { color: c.gold, fontSize: 8, fontWeight: '900', letterSpacing: 1.3 },
  title: { color: c.white, fontSize: 20, fontWeight: '900', marginTop: 3 }, subtitle: { color: '#D7C8E2', fontSize: 10, marginTop: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 12 },
  metric: { width: '48%', flexGrow: 1, minHeight: 100, borderRadius: 14, padding: 12, backgroundColor: c.white, borderWidth: 1, borderColor: c.border },
  metricAccent: { backgroundColor: c.purple, borderColor: c.purple },
  metricValue: { color: c.plum, fontSize: 22, fontWeight: '900', marginTop: 8 }, metricValueAccent: { color: c.white },
  metricLabel: { color: c.muted, fontSize: 8, letterSpacing: 0.7, fontWeight: '900', marginTop: 3 }, metricLabelAccent: { color: '#E8DDF1' },
  actions: { gap: 8, marginTop: 13 }, action: { minHeight: 65, padding: 11, paddingLeft: 51, justifyContent: 'center', backgroundColor: c.white, borderRadius: 13, borderWidth: 1, borderColor: c.border },
  actionIcon: { position: 'absolute', left: 12, width: 29, height: 29, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: c.lavender },
  actionTitle: { color: c.plum, fontWeight: '900', fontSize: 11 }, actionDetail: { color: c.muted, fontSize: 9, marginTop: 3 }, actionArrow: { position: 'absolute', right: 13, top: 25 },
  panel: { marginTop: 13, padding: 13, borderRadius: 14, backgroundColor: c.white, borderWidth: 1, borderColor: c.border }, panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  panelTitle: { color: c.plum, fontSize: 12, fontWeight: '900' }, link: { color: c.purple, fontSize: 10, fontWeight: '900' },
  orderRow: { minHeight: 53, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderColor: '#F1EDF4', gap: 9 }, orderIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: c.lavender, alignItems: 'center', justifyContent: 'center' },
  orderCopy: { flex: 1 }, orderName: { color: c.ink, fontSize: 10, fontWeight: '800' }, orderMeta: { color: c.muted, fontSize: 8, marginTop: 3 }, orderTotal: { color: c.plum, fontSize: 10, fontWeight: '900' },
  dishRow: { height: 37, borderTopWidth: 1, borderColor: '#F1EDF4', flexDirection: 'row', alignItems: 'center', gap: 9 }, rank: { color: c.purple, fontSize: 10, fontWeight: '900', width: 17 }, dishName: { flex: 1, color: c.ink, fontSize: 10, fontWeight: '700' }, dishQty: { color: c.muted, fontSize: 9 },
  empty: { color: c.muted, fontSize: 10, paddingVertical: 13 }, note: { color: c.muted, fontSize: 9, marginTop: 13, textAlign: 'center' }, state: { height: 150, alignItems: 'center', justifyContent: 'center', gap: 9 }, stateText: { color: c.muted, fontSize: 10 }, error: { marginTop: 14, padding: 13, backgroundColor: c.white, borderRadius: 12 }, errorText: { color: c.red, fontSize: 10, textAlign: 'center', fontWeight: '700' },
});
