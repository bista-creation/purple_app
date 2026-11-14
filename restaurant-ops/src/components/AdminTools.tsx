import { useMemo } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import {
  listAdminCategories,
  listAdminDishes,
  listAdminEvents,
  listAdminReservations,
  listAdminRiders,
  setDishAvailability,
  setRiderBlocked,
  updateAdminEvent,
  updateAdminReservation,
  type AdminEventBooking,
  type AdminReservation,
} from '../services/api';
import { palette as c, radii, shadows } from '../theme/tokens';

type Section = 'menu' | 'bookings' | 'riders';
const humanize = (value: string) =>
  value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const dateLabel = (value: string) =>
  new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const money = (paisa: number) => `Rs ${Math.round(paisa / 100).toLocaleString('en-IN')}`;

export default function AdminTools({ section }: { section: Section }) {
  const client = useQueryClient();
  const categories = useQuery({ queryKey: ['admin-menu-categories'], queryFn: listAdminCategories, enabled: section === 'menu' });
  const dishes = useQuery({ queryKey: ['admin-menu-dishes'], queryFn: listAdminDishes, enabled: section === 'menu' });
  const reservations = useQuery({ queryKey: ['admin-reservations'], queryFn: listAdminReservations, enabled: section === 'bookings', refetchInterval: 30_000 });
  const events = useQuery({ queryKey: ['admin-event-bookings'], queryFn: listAdminEvents, enabled: section === 'bookings', refetchInterval: 30_000 });
  const riders = useQuery({ queryKey: ['admin-riders'], queryFn: listAdminRiders, enabled: section === 'riders' });
  const categoriesById = useMemo(
    () => new Map((categories.data ?? []).map((category) => [category.id, category.name])),
    [categories.data]
  );

  const refreshMenu = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['admin-menu-dishes'] }),
      client.invalidateQueries({ queryKey: ['admin-report'] }),
    ]);

  const setDish = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) => setDishAvailability(id, value),
    onSuccess: refreshMenu,
    onError: (error) => Alert.alert('Menu update failed', error instanceof Error ? error.message : 'Please retry.'),
  });

  const setReservation = useMutation({
    mutationFn: updateAdminReservation,
    onSuccess: () => client.invalidateQueries({ queryKey: ['admin-reservations'] }),
    onError: (error) => Alert.alert('Booking update failed', error instanceof Error ? error.message : 'Please retry.'),
  });

  const setEvent = useMutation({
    mutationFn: updateAdminEvent,
    onSuccess: () => client.invalidateQueries({ queryKey: ['admin-event-bookings'] }),
    onError: (error) => Alert.alert('Enquiry update failed', error instanceof Error ? error.message : 'Please retry.'),
  });

  const setBlocked = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) => setRiderBlocked(id, value),
    onSuccess: () => client.invalidateQueries({ queryKey: ['admin-riders'] }),
    onError: (error) => Alert.alert('Rider update failed', error instanceof Error ? error.message : 'Please retry.'),
  });

  const loading =
    section === 'menu'
      ? categories.isLoading || dishes.isLoading
      : section === 'bookings'
      ? reservations.isLoading || events.isLoading
      : riders.isLoading;

  const failed =
    section === 'menu'
      ? categories.isError || dishes.isError
      : section === 'bookings'
      ? reservations.isError || events.isError
      : riders.isError;

  const retry = () => {
    if (section === 'menu') {
      void categories.refetch();
      void dishes.refetch();
    } else if (section === 'bookings') {
      void reservations.refetch();
      void events.refetch();
    } else {
      void riders.refetch();
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {/* Section Header */}
      <View style={styles.heading}>
        <View style={styles.headingIcon}>
          <Ionicons
            name={section === 'menu' ? 'restaurant' : section === 'bookings' ? 'calendar' : 'bicycle'}
            size={22}
            color={c.gold}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>ADMINISTRATION & INVENTORY</Text>
          <Text style={styles.title}>
            {section === 'menu'
              ? 'Menu & Dish Availability'
              : section === 'bookings'
              ? 'Bookings & Event Enquiries'
              : 'Delivery Rider Fleet'}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.state}>
          <ActivityIndicator color={c.purple} size="large" />
          <Text style={styles.muted}>Loading data…</Text>
        </View>
      ) : failed ? (
        <Pressable onPress={retry} style={styles.card}>
          <Text style={styles.errorText}>Could not load this section. Tap to retry.</Text>
        </Pressable>
      ) : null}

      {/* Menu Section */}
      {!loading && !failed && section === 'menu' && (
        <>
          <Text style={styles.help}>
            Toggle dish availability in real-time. Sold-out dishes are immediately greyed out and hidden from customer orders.
          </Text>
          {(dishes.data ?? []).map((dish) => (
            <View key={dish.id} style={styles.card}>
              <View style={styles.row}>
                <View style={styles.grow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.itemTitle}>{dish.name}</Text>
                    {dish.isFeatured ? (
                      <View style={styles.featuredBadge}>
                        <Text style={styles.featuredBadgeText}>Featured</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.detail}>
                    {categoriesById.get(dish.category.id) ?? dish.category.name} · {money(dish.price)}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="switch"
                  accessibilityState={{ checked: dish.isAvailable }}
                  accessibilityLabel={`${dish.name} availability`}
                  disabled={setDish.isPending}
                  onPress={() => setDish.mutate({ id: dish.id, value: !dish.isAvailable })}
                  style={[styles.pill, dish.isAvailable ? styles.pillOn : styles.pillOff]}
                >
                  <Ionicons
                    name={dish.isAvailable ? 'checkmark-circle' : 'close-circle'}
                    size={14}
                    color={dish.isAvailable ? c.green : c.red}
                  />
                  <Text style={[styles.pillText, dish.isAvailable ? styles.pillTextOn : styles.pillTextOff]}>
                    {dish.isAvailable ? 'AVAILABLE' : 'SOLD OUT'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
          {!dishes.data?.length && <Text style={styles.empty}>No menu items found.</Text>}
        </>
      )}

      {/* Bookings Section */}
      {!loading && !failed && section === 'bookings' && (
        <>
          <View style={styles.sectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="restaurant-outline" size={16} color={c.purple} />
              <Text style={styles.section}>TABLE RESERVATIONS</Text>
            </View>
            {reservations.data?.some((r) => r.status === 'PENDING') && (
              <View style={styles.urgentPill}>
                <Text style={styles.urgentPillText}>Needs Confirmation</Text>
              </View>
            )}
          </View>
          {(reservations.data ?? []).map((booking) => (
            <ReservationCard
              key={booking.id}
              booking={booking}
              busy={setReservation.isPending}
              onStatus={(status) => setReservation.mutate({ id: booking.id, status })}
            />
          ))}
          {!reservations.data?.length && <Text style={styles.empty}>No reservations found.</Text>}

          <View style={[styles.sectionHeader, { marginTop: 22 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="sparkles-outline" size={16} color={c.gold} />
              <Text style={styles.section}>EVENT ENQUIRIES & CATERING</Text>
            </View>
            {events.data?.some((e) => e.status === 'PENDING') && (
              <View style={styles.urgentPill}>
                <Text style={styles.urgentPillText}>Action Needed</Text>
              </View>
            )}
          </View>
          {(events.data ?? []).map((booking) => (
            <EventCard
              key={booking.id}
              booking={booking}
              busy={setEvent.isPending}
              onStatus={(status) => setEvent.mutate({ id: booking.id, status })}
            />
          ))}
          {!events.data?.length && <Text style={styles.empty}>No event enquiries found.</Text>}
        </>
      )}

      {/* Riders Section */}
      {!loading && !failed && section === 'riders' && (
        <>
          <Text style={styles.help}>
            Monitor active delivery fleet, review licenses, and pause/restore rider dispatch permissions.
          </Text>
          {(riders.data ?? []).map((rider) => (
            <View key={rider.id} style={styles.card}>
              <View style={styles.row}>
                <View style={styles.riderAvatar}>
                  <Ionicons name="bicycle" size={20} color={c.purple} />
                </View>
                <View style={styles.grow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.itemTitle}>{rider.name || 'Unnamed rider'}</Text>
                    <View style={styles.tagPill}>
                      <Text style={styles.tagPillText}>{humanize(rider.vehicleType)}</Text>
                    </View>
                  </View>
                  <Text style={styles.detail}>
                    {rider.phone || rider.email} · License: {humanize(rider.licenseStatus)}
                  </Text>
                  <Text style={styles.detailAccent}>
                    {rider.activeDeliveriesCount === 0
                      ? 'Available now'
                      : `${rider.activeDeliveriesCount} active ${
                          rider.activeDeliveriesCount === 1 ? 'order' : 'orders'
                        }`}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${rider.isBlocked ? 'Restore' : 'Pause'} ${rider.name || 'rider'}`}
                  disabled={setBlocked.isPending}
                  onPress={() => setBlocked.mutate({ id: rider.id, value: !rider.isBlocked })}
                  style={[styles.pill, rider.isBlocked ? styles.pillOff : styles.pillOn]}
                >
                  <Text style={[styles.pillText, rider.isBlocked ? styles.pillTextOff : styles.pillTextOn]}>
                    {rider.isBlocked ? 'RESTORE' : 'PAUSE'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
          {!riders.data?.length && <Text style={styles.empty}>No riders registered in fleet.</Text>}
        </>
      )}
    </ScrollView>
  );
}

function ReservationCard({
  booking,
  busy,
  onStatus,
}: {
  booking: AdminReservation;
  busy: boolean;
  onStatus: (status: string) => void;
}) {
  const isPending = booking.status === 'PENDING';
  const nextStatus =
    booking.status === 'PENDING'
      ? 'CONFIRMED'
      : booking.status === 'CONFIRMED'
      ? 'SEATED'
      : booking.status === 'SEATED'
      ? 'COMPLETED'
      : undefined;

  return (
    <View style={[styles.card, isPending && styles.cardPending]}>
      <View style={styles.row}>
        <View style={styles.grow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={styles.itemTitle}>
              {booking.name} · {booking.guests} guests
            </Text>
            {isPending && (
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>PENDING CONFIRMATION</Text>
              </View>
            )}
          </View>
          <Text style={styles.detail}>
            📅 {dateLabel(booking.date)} · 📞 {booking.phone}
          </Text>
          <Text style={styles.detail}>
            {booking.occasion || 'Table reservation'} · Status: {humanize(booking.status)}
            {booking.tableNumber ? ` · Table ${booking.tableNumber}` : ''}
          </Text>
        </View>
      </View>
      {nextStatus ? (
        <View style={styles.buttonRow}>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => onStatus(nextStatus)}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryText}>
              {nextStatus === 'CONFIRMED' ? 'Confirm Reservation' : nextStatus === 'SEATED' ? 'Mark Seated' : 'Complete'}
            </Text>
          </Pressable>
          {booking.status !== 'SEATED' && (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => onStatus('CANCELLED')}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryText}>Decline</Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );
}

function EventCard({
  booking,
  busy,
  onStatus,
}: {
  booking: AdminEventBooking;
  busy: boolean;
  onStatus: (status: string) => void;
}) {
  const isPending = booking.status === 'PENDING';

  return (
    <View style={[styles.card, isPending && styles.cardPending]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Text style={styles.itemTitle}>
          {booking.eventType} · {booking.guests} guests
        </Text>
        {isPending && (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>NEW ENQUIRY</Text>
          </View>
        )}
      </View>
      <Text style={styles.detail}>
        Contact: {booking.name} · 📞 {booking.phone}
      </Text>
      <Text style={styles.detail}>
        📅 {dateLabel(booking.eventDate)}
        {booking.venue?.name ? ` · Venue: ${booking.venue.name}` : ''}
      </Text>
      <Text style={styles.detail}>Status: {humanize(booking.status)}</Text>
      {booking.status === 'PENDING' && (
        <View style={styles.buttonRow}>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => onStatus('CONFIRMED')}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryText}>Confirm enquiry</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => onStatus('CANCELLED')}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryText}>Decline</Text>
          </Pressable>
        </View>
      )}
      {booking.status === 'CONFIRMED' && (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => onStatus('COMPLETED')}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryText}>Mark complete</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 40,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  headingIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: c.plum,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  kicker: {
    color: c.purple,
    fontWeight: '900',
    fontSize: 9,
    letterSpacing: 1.2,
  },
  title: {
    color: c.plum,
    fontWeight: '900',
    fontSize: 20,
    marginTop: 2,
  },
  help: {
    color: c.muted,
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 4,
  },
  section: {
    color: c.purple,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  urgentPill: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  urgentPillText: {
    color: c.amber,
    fontSize: 9,
    fontWeight: '900',
  },
  card: {
    backgroundColor: c.white,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radii.lg,
    padding: 14,
    marginTop: 9,
    ...shadows.sm,
  },
  cardPending: {
    borderColor: '#F5B942',
    borderWidth: 1.5,
  },
  pendingBadge: {
    backgroundColor: '#F5B942',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  pendingBadgeText: {
    color: c.white,
    fontSize: 8,
    fontWeight: '900',
  },
  featuredBadge: {
    backgroundColor: c.lavender,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  featuredBadgeText: {
    color: c.purple,
    fontSize: 8,
    fontWeight: '800',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  grow: {
    flex: 1,
  },
  itemTitle: {
    color: c.plum,
    fontSize: 13,
    fontWeight: '900',
  },
  detail: {
    color: c.muted,
    fontSize: 10,
    marginTop: 3,
  },
  detailAccent: {
    color: c.purple,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  riderAvatar: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: c.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagPill: {
    backgroundColor: c.paper,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  tagPillText: {
    color: c.muted,
    fontSize: 9,
    fontWeight: '700',
  },
  pill: {
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pillOn: {
    backgroundColor: '#E8F5ED',
  },
  pillOff: {
    backgroundColor: '#FFF1ED',
  },
  pillText: {
    fontSize: 9,
    fontWeight: '900',
  },
  pillTextOn: {
    color: c.green,
  },
  pillTextOff: {
    color: c.red,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 12,
  },
  primaryButton: {
    backgroundColor: c.purple,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    ...shadows.sm,
  },
  primaryText: {
    color: c.white,
    fontSize: 11,
    fontWeight: '900',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: c.red,
    fontSize: 11,
    fontWeight: '900',
  },
  empty: {
    color: c.muted,
    fontSize: 11,
    paddingVertical: 16,
    textAlign: 'center',
  },
  state: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 150,
  },
  muted: {
    color: c.muted,
    fontSize: 11,
  },
  errorText: {
    color: c.red,
    fontSize: 11,
    textAlign: 'center',
  },
});
