import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { palette as c } from '../theme/tokens';
import type { StaffOrder } from '../services/api';

type Props = {
  order: StaffOrder | null;
  onAccept: (order: StaffOrder) => void;
  onDecline: (order: StaffOrder) => void;
  onDismiss: () => void;
  busy?: boolean;
};

const money = (paisa: number) => `Rs ${Math.round(paisa / 100).toLocaleString('en-IN')}`;

export default function NewOrderAlertModal({
  order,
  onAccept,
  onDecline,
  onDismiss,
  busy = false,
}: Props) {
  if (!order) return null;

  const itemCount = order.items?.reduce((sum, item) => sum + item.quantity, 0) || order.items?.length || 1;

  return (
    <Modal visible={Boolean(order)} animationType="fade" transparent onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.banner}>
            <View style={styles.bell}>
              <Ionicons name="notifications" size={24} color={c.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>INCOMING ORDER ALERT</Text>
              <Text style={styles.orderNumber}>Order #{order.orderNumber}</Text>
            </View>
            <View style={styles.typePill}>
              <Text style={styles.typeText}>{order.type.replaceAll('_', ' ')}</Text>
            </View>
          </View>

          <View style={styles.body}>
            <View style={styles.detailRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.customerName}>{order.customerName}</Text>
                {order.customerPhone ? <Text style={styles.customerPhone}>{order.customerPhone}</Text> : null}
              </View>
              <View style={styles.priceBox}>
                <Text style={styles.total}>{money(order.total)}</Text>
                <Text style={styles.paymentStatus}>{order.paymentMethod} · {order.paymentStatus}</Text>
              </View>
            </View>

            {order.deliveryAddress ? (
              <View style={styles.addressBox}>
                <Ionicons name="location-outline" size={14} color={c.purple} />
                <Text style={styles.addressText} numberOfLines={2}>
                  {order.deliveryAddress}
                </Text>
              </View>
            ) : order.tableNumber ? (
              <View style={styles.addressBox}>
                <Ionicons name="restaurant-outline" size={14} color={c.purple} />
                <Text style={styles.addressText}>Table: {order.tableNumber}</Text>
              </View>
            ) : null}

            {order.notes ? (
              <View style={styles.notesBox}>
                <Ionicons name="chatbubble-ellipses-outline" size={13} color={c.amber} />
                <Text style={styles.notesText} numberOfLines={2}>
                  Note: {order.notes}
                </Text>
              </View>
            ) : null}

            <View style={styles.itemsSummary}>
              <Text style={styles.itemsHeader}>ORDER ITEMS ({itemCount})</Text>
              {order.items?.slice(0, 4).map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {item.quantity}× {item.name}
                    {item.variantName ? ` (${item.variantName})` : ''}
                  </Text>
                  <Text style={styles.itemTotal}>{money(item.lineTotal)}</Text>
                </View>
              ))}
              {(order.items?.length || 0) > 4 ? (
                <Text style={styles.moreItems}>+ {(order.items?.length || 0) - 4} more items...</Text>
              ) : null}
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable
              disabled={busy}
              onPress={() => onDecline(order)}
              style={styles.declineBtn}
            >
              <Text style={styles.declineText}>Decline</Text>
            </Pressable>

            <Pressable
              disabled={busy}
              onPress={() => onAccept(order)}
              style={styles.acceptBtn}
            >
              <Ionicons name="checkmark-circle" size={18} color={c.white} />
              <Text style={styles.acceptText}>Accept Order Now</Text>
            </Pressable>
          </View>

          <Pressable onPress={onDismiss} style={styles.dismissBtn}>
            <Text style={styles.dismissText}>Snooze alert & view in queue</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: c.white,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  banner: {
    backgroundColor: c.red,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bell: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kicker: {
    color: '#FFE4E0',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  orderNumber: {
    color: c.white,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 2,
  },
  typePill: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  typeText: {
    color: c.white,
    fontSize: 9,
    fontWeight: '900',
  },
  body: {
    padding: 16,
    gap: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  customerName: {
    color: c.plum,
    fontSize: 16,
    fontWeight: '900',
  },
  customerPhone: {
    color: c.muted,
    fontSize: 12,
    marginTop: 2,
  },
  priceBox: {
    alignItems: 'flex-end',
  },
  total: {
    color: c.plum,
    fontSize: 18,
    fontWeight: '900',
  },
  paymentStatus: {
    color: c.muted,
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
  },
  addressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    backgroundColor: c.lavender,
    borderRadius: 8,
  },
  addressText: {
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
    backgroundColor: '#FFF9E6',
    borderRadius: 8,
  },
  notesText: {
    color: c.amber,
    fontSize: 11,
    fontWeight: '600',
    fontStyle: 'italic',
    flex: 1,
  },
  itemsSummary: {
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: 8,
  },
  itemsHeader: {
    color: c.muted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  itemName: {
    color: c.ink,
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  itemTotal: {
    color: c.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  moreItems: {
    color: c.muted,
    fontSize: 10,
    marginTop: 4,
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  declineBtn: {
    height: 46,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E7C3C0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineText: {
    color: c.red,
    fontSize: 12,
    fontWeight: '900',
  },
  acceptBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: c.purple,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  acceptText: {
    color: c.white,
    fontSize: 13,
    fontWeight: '900',
  },
  dismissBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissText: {
    color: c.muted,
    fontSize: 11,
    fontWeight: '700',
  },
});
