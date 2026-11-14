import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DispatchRider } from '../services/api';
import { palette as c, radii, shadows } from '../theme/tokens';

export default function RiderAssignSheet({
  visible,
  orderNumber,
  riders,
  loading,
  error,
  submitting,
  onClose,
  onRetry,
  onAssign,
}: {
  visible: boolean;
  orderNumber: string;
  riders: DispatchRider[];
  loading: boolean;
  error: boolean;
  submitting: boolean;
  onClose: () => void;
  onRetry: () => void;
  onAssign: (rider: DispatchRider) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const available = riders.filter(
    (rider) => !rider.isBlocked && rider.shiftStatus === 'ON_DUTY' && rider.licenseStatus === 'VERIFIED'
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.dragHandle} />
          <View style={s.heading}>
            <View style={{ flex: 1 }}>
              <View style={s.headerBadgeRow}>
                <Text style={s.eyebrow}>DISPATCH ASSIGNMENT</Text>
                <View style={s.badgePill}>
                  <Text style={s.badgePillText}>Order #{orderNumber}</Text>
                </View>
              </View>
              <Text style={s.title}>Assign Delivery Rider</Text>
              <Text style={s.caption}>
                The selected rider will receive an instant dispatch alarm with a 120-second acceptance timer.
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={s.close}>
              <Ionicons name="close" size={22} color={c.ink} />
            </Pressable>
          </View>

          {loading ? (
            <View style={s.loading}>
              <ActivityIndicator color={c.purple} size="large" />
              <Text style={s.muted}>Checking on-duty riders…</Text>
            </View>
          ) : error ? (
            <View style={s.empty}>
              <Ionicons name="alert-circle-outline" size={28} color={c.red} />
              <Text style={s.emptyTitle}>Could not load available riders</Text>
              <Pressable onPress={onRetry} style={s.retryButton}>
                <Text style={s.retryText}>Tap to retry</Text>
              </Pressable>
            </View>
          ) : available.length ? (
            <ScrollView style={s.list} contentContainerStyle={{ paddingBottom: 8 }}>
              {available.map((rider) => {
                const isSelected = selected === rider.id;
                const isMotorcycle = rider.vehicleType?.toUpperCase().includes('MOTOR') || rider.vehicleType?.toUpperCase().includes('BIKE');

                return (
                  <Pressable
                    key={rider.id}
                    onPress={() => setSelected(rider.id)}
                    style={[s.rider, isSelected && s.riderSelected]}
                  >
                    <View style={[s.bike, isSelected && s.bikeSelected]}>
                      <Ionicons
                        name={isMotorcycle ? 'bicycle' : 'car'}
                        size={20}
                        color={isSelected ? c.white : c.purple}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={s.name}>{rider.name || 'Unnamed Rider'}</Text>
                        <View style={s.vehiclePill}>
                          <Text style={s.vehiclePillText}>{rider.vehicleType}</Text>
                        </View>
                      </View>
                      <Text style={s.meta}>
                        {rider.activeDeliveriesCount === 0
                          ? 'Available now · 0 active orders'
                          : `${rider.activeDeliveriesCount} active ${
                              rider.activeDeliveriesCount === 1 ? 'delivery' : 'deliveries'
                            }`}
                      </Text>
                      {rider.phone ? <Text style={s.phoneText}>📞 {rider.phone}</Text> : null}
                    </View>
                    <View style={[s.radioCircle, isSelected && s.radioCircleSelected]}>
                      {isSelected ? <View style={s.radioInnerDot} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
            <View style={s.empty}>
              <Ionicons name="bicycle-outline" size={32} color={c.mutedLight} />
              <Text style={s.emptyTitle}>No on-duty riders available</Text>
              <Text style={s.meta}>
                Riders must have status ON_DUTY with an approved and verified license in the system.
              </Text>
            </View>
          )}

          <View style={s.footer}>
            <Pressable onPress={onClose} style={s.cancel}>
              <Text style={s.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              disabled={!selected || submitting || loading}
              onPress={() => {
                const rider = available.find((item) => item.id === selected);
                if (rider) onAssign(rider);
              }}
              style={[s.assign, (!selected || submitting) && { opacity: 0.5 }]}
            >
              {submitting ? (
                <ActivityIndicator color={c.white} />
              ) : (
                <>
                  <Ionicons name="send" size={15} color={c.white} />
                  <Text style={s.assignText}>Dispatch Rider</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(23, 9, 32, 0.65)',
  },
  sheet: {
    maxHeight: '84%',
    backgroundColor: c.paper,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: 20,
    paddingBottom: 28,
    ...shadows.lg,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1C6DA',
    alignSelf: 'center',
    marginBottom: 12,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  headerBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eyebrow: {
    color: c.purple,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  badgePill: {
    backgroundColor: c.lavender,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgePillText: {
    color: c.deep,
    fontSize: 9,
    fontWeight: '800',
  },
  title: {
    color: c.plum,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 4,
  },
  caption: {
    color: c.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  close: {
    padding: 6,
  },
  list: {
    maxHeight: 320,
  },
  rider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: c.white,
    borderWidth: 1.5,
    borderColor: c.border,
    borderRadius: radii.md,
    marginTop: 8,
    ...shadows.sm,
  },
  riderSelected: {
    borderColor: c.purple,
    backgroundColor: '#FAF5FF',
  },
  bike: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: c.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bikeSelected: {
    backgroundColor: c.purple,
  },
  name: {
    color: c.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  vehiclePill: {
    backgroundColor: c.surfaceSubtle,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  vehiclePillText: {
    color: c.muted,
    fontSize: 9,
    fontWeight: '700',
  },
  meta: {
    color: c.muted,
    fontSize: 11,
    marginTop: 2,
  },
  phoneText: {
    color: c.deep,
    fontSize: 10,
    marginTop: 3,
    fontWeight: '600',
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: c.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: {
    borderColor: c.purple,
  },
  radioInnerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: c.purple,
  },
  loading: {
    minHeight: 130,
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  muted: {
    color: c.muted,
    fontSize: 11,
    textAlign: 'center',
  },
  empty: {
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    backgroundColor: c.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: c.border,
  },
  emptyTitle: {
    color: c.plum,
    fontSize: 13,
    fontWeight: '800',
  },
  retryButton: {
    backgroundColor: c.lavender,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.sm,
  },
  retryText: {
    color: c.purple,
    fontSize: 11,
    fontWeight: '800',
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  cancel: {
    paddingHorizontal: 18,
    height: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: c.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.white,
  },
  cancelText: {
    color: c.ink,
    fontSize: 12,
    fontWeight: '800',
  },
  assign: {
    flex: 1,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: c.purple,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...shadows.sm,
  },
  assignText: {
    color: c.white,
    fontSize: 13,
    fontWeight: '900',
  },
});
