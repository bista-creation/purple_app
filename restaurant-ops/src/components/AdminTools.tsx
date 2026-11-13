import { useMemo } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { listAdminCategories, listAdminDishes, listAdminEvents, listAdminReservations, listAdminRiders, setDishAvailability, setRiderBlocked, updateAdminEvent, updateAdminReservation, type AdminEventBooking, type AdminReservation } from '../services/api';
import { palette as c } from '../theme/tokens';

type Section = 'menu' | 'bookings' | 'riders';
const humanize = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const dateLabel = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const money = (paisa: number) => `Rs ${Math.round(paisa / 100).toLocaleString('en-IN')}`;

export default function AdminTools({ section }: { section: Section }) {
  const client = useQueryClient();
  const categories = useQuery({ queryKey: ['admin-menu-categories'], queryFn: listAdminCategories, enabled: section === 'menu' });
  const dishes = useQuery({ queryKey: ['admin-menu-dishes'], queryFn: listAdminDishes, enabled: section === 'menu' });
  const reservations = useQuery({ queryKey: ['admin-reservations'], queryFn: listAdminReservations, enabled: section === 'bookings' });
  const events = useQuery({ queryKey: ['admin-event-bookings'], queryFn: listAdminEvents, enabled: section === 'bookings' });
  const riders = useQuery({ queryKey: ['admin-riders'], queryFn: listAdminRiders, enabled: section === 'riders' });
  const categoriesById = useMemo(() => new Map((categories.data ?? []).map((category) => [category.id, category.name])), [categories.data]);
  const refreshMenu = () => Promise.all([client.invalidateQueries({ queryKey: ['admin-menu-dishes'] }), client.invalidateQueries({ queryKey: ['admin-report'] })]);
  const setDish = useMutation({ mutationFn: ({ id, value }: { id: string; value: boolean }) => setDishAvailability(id, value), onSuccess: refreshMenu, onError: (error) => Alert.alert('Menu update failed', error instanceof Error ? error.message : 'Please retry.') });
  const setReservation = useMutation({ mutationFn: updateAdminReservation, onSuccess: () => client.invalidateQueries({ queryKey: ['admin-reservations'] }), onError: (error) => Alert.alert('Booking update failed', error instanceof Error ? error.message : 'Please retry.') });
  const setEvent = useMutation({ mutationFn: updateAdminEvent, onSuccess: () => client.invalidateQueries({ queryKey: ['admin-event-bookings'] }), onError: (error) => Alert.alert('Enquiry update failed', error instanceof Error ? error.message : 'Please retry.') });
  const setBlocked = useMutation({ mutationFn: ({ id, value }: { id: string; value: boolean }) => setRiderBlocked(id, value), onSuccess: () => client.invalidateQueries({ queryKey: ['admin-riders'] }), onError: (error) => Alert.alert('Rider update failed', error instanceof Error ? error.message : 'Please retry.') });

  const loading = section === 'menu' ? categories.isLoading || dishes.isLoading : section === 'bookings' ? reservations.isLoading || events.isLoading : riders.isLoading;
  const failed = section === 'menu' ? categories.isError || dishes.isError : section === 'bookings' ? reservations.isError || events.isError : riders.isError;
  const retry = () => {
    if (section === 'menu') { void categories.refetch(); void dishes.refetch(); }
    else if (section === 'bookings') { void reservations.refetch(); void events.refetch(); }
    else void riders.refetch();
  };

  return <ScrollView contentContainerStyle={styles.content}>
    <View style={styles.heading}><View style={styles.headingIcon}><Ionicons name={section === 'menu' ? 'restaurant' : section === 'bookings' ? 'calendar' : 'bicycle'} size={20} color={c.gold} /></View><View><Text style={styles.kicker}>ADMIN MANAGEMENT</Text><Text style={styles.title}>{section === 'menu' ? 'Menu availability' : section === 'bookings' ? 'Bookings & enquiries' : 'Rider management'}</Text></View></View>
    {loading ? <View style={styles.state}><ActivityIndicator color={c.purple} /><Text style={styles.muted}>Loading management data…</Text></View> : failed ? <Pressable onPress={retry} style={styles.card}><Text style={styles.errorText}>Could not load this section. Tap to retry.</Text></Pressable> : null}
    {!loading && !failed && section === 'menu' && <>
      <Text style={styles.help}>Control whether dishes appear as orderable on the customer menu.</Text>
      {(dishes.data ?? []).map((dish) => <View key={dish.id} style={styles.card}>
        <View style={styles.row}><View style={styles.grow}><Text style={styles.itemTitle}>{dish.name}</Text><Text style={styles.detail}>{categoriesById.get(dish.category.id) ?? dish.category.name} · {money(dish.price)}{dish.isFeatured ? ' · Featured' : ''}</Text></View><Pressable accessibilityRole="switch" accessibilityState={{ checked: dish.isAvailable }} accessibilityLabel={`${dish.name} availability`} disabled={setDish.isPending} onPress={() => setDish.mutate({ id: dish.id, value: !dish.isAvailable })} style={[styles.pill, dish.isAvailable ? styles.pillOn : styles.pillOff]}><Text style={[styles.pillText, dish.isAvailable ? styles.pillTextOn : styles.pillTextOff]}>{dish.isAvailable ? 'AVAILABLE' : 'SOLD OUT'}</Text></Pressable></View>
      </View>)}
      {!dishes.data?.length && <Text style={styles.empty}>No menu items found.</Text>}
    </>}
    {!loading && !failed && section === 'bookings' && <>
      <Text style={styles.section}>TABLE RESERVATIONS</Text>
      {(reservations.data ?? []).map((booking) => <ReservationCard key={booking.id} booking={booking} busy={setReservation.isPending} onStatus={(status) => setReservation.mutate({ id: booking.id, status })} />)}
      {!reservations.data?.length && <Text style={styles.empty}>No reservations found.</Text>}
      <Text style={styles.section}>EVENT ENQUIRIES</Text>
      {(events.data ?? []).map((booking) => <EventCard key={booking.id} booking={booking} busy={setEvent.isPending} onStatus={(status) => setEvent.mutate({ id: booking.id, status })} />)}
      {!events.data?.length && <Text style={styles.empty}>No event enquiries found.</Text>}
    </>}
    {!loading && !failed && section === 'riders' && <>
      <Text style={styles.help}>Review rider status and pause or restore dispatch access.</Text>
      {(riders.data ?? []).map((rider) => <View key={rider.id} style={styles.card}><View style={styles.row}><View style={styles.grow}><Text style={styles.itemTitle}>{rider.name || 'Unnamed rider'}</Text><Text style={styles.detail}>{rider.phone || rider.email} · {humanize(rider.vehicleType)}</Text><Text style={styles.detail}>License {humanize(rider.licenseStatus)} · {rider.activeDeliveriesCount} active delivery</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`${rider.isBlocked ? 'Restore' : 'Pause'} ${rider.name || 'rider'}`} disabled={setBlocked.isPending} onPress={() => setBlocked.mutate({ id: rider.id, value: !rider.isBlocked })} style={[styles.pill, rider.isBlocked ? styles.pillOn : styles.pillOff]}><Text style={[styles.pillText, rider.isBlocked ? styles.pillTextOn : styles.pillTextOff]}>{rider.isBlocked ? 'RESTORE' : 'PAUSE'}</Text></Pressable></View></View>)}
      {!riders.data?.length && <Text style={styles.empty}>No riders found.</Text>}
    </>}
  </ScrollView>;
}

function ReservationCard({ booking, busy, onStatus }: { booking: AdminReservation; busy: boolean; onStatus: (status: string) => void }) {
  const nextStatus = booking.status === 'PENDING' ? 'CONFIRMED' : booking.status === 'CONFIRMED' ? 'SEATED' : booking.status === 'SEATED' ? 'COMPLETED' : undefined;
  return <View style={styles.card}><View style={styles.row}><View style={styles.grow}><Text style={styles.itemTitle}>{booking.name} · {booking.guests} guests</Text><Text style={styles.detail}>{dateLabel(booking.date)} · {booking.phone}</Text><Text style={styles.detail}>{booking.occasion || 'Table reservation'} · {humanize(booking.status)}{booking.tableNumber ? ` · Table ${booking.tableNumber}` : ''}</Text></View></View>{nextStatus ? <View style={styles.buttonRow}><Pressable accessibilityRole="button" disabled={busy} onPress={() => onStatus(nextStatus)} style={styles.primaryButton}><Text style={styles.primaryText}>{nextStatus === 'CONFIRMED' ? 'Confirm' : nextStatus === 'SEATED' ? 'Mark seated' : 'Complete'}</Text></Pressable>{booking.status !== 'SEATED' && <Pressable accessibilityRole="button" disabled={busy} onPress={() => onStatus('CANCELLED')} style={styles.secondaryButton}><Text style={styles.secondaryText}>Cancel</Text></Pressable>}</View> : null}</View>;
}

function EventCard({ booking, busy, onStatus }: { booking: AdminEventBooking; busy: boolean; onStatus: (status: string) => void }) {
  return <View style={styles.card}><Text style={styles.itemTitle}>{booking.eventType} · {booking.guests} guests</Text><Text style={styles.detail}>{booking.name} · {booking.phone}</Text><Text style={styles.detail}>{dateLabel(booking.eventDate)}{booking.venue?.name ? ` · ${booking.venue.name}` : ''}</Text><Text style={styles.detail}>Status: {humanize(booking.status)}</Text>{booking.status === 'PENDING' && <View style={styles.buttonRow}><Pressable accessibilityRole="button" disabled={busy} onPress={() => onStatus('CONFIRMED')} style={styles.primaryButton}><Text style={styles.primaryText}>Confirm enquiry</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={() => onStatus('CANCELLED')} style={styles.secondaryButton}><Text style={styles.secondaryText}>Decline</Text></Pressable></View>}{booking.status === 'CONFIRMED' && <Pressable accessibilityRole="button" disabled={busy} onPress={() => onStatus('COMPLETED')} style={styles.primaryButton}><Text style={styles.primaryText}>Mark complete</Text></Pressable>}</View>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 35, maxWidth: 700, width: '100%', alignSelf: 'center' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 12 }, headingIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: c.plum, alignItems: 'center', justifyContent: 'center' },
  kicker: { color: c.purple, fontWeight: '900', fontSize: 8, letterSpacing: 1.2 }, title: { color: c.plum, fontWeight: '900', fontSize: 19, marginTop: 2 },
  help: { color: c.muted, fontSize: 10, lineHeight: 16, marginBottom: 8 }, section: { color: c.purple, fontSize: 9, fontWeight: '900', letterSpacing: 1, marginTop: 12, marginBottom: 2 },
  card: { backgroundColor: c.white, borderWidth: 1, borderColor: c.border, borderRadius: 13, padding: 12, marginTop: 8 }, row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, grow: { flex: 1 }, itemTitle: { color: c.plum, fontSize: 11, fontWeight: '900' }, detail: { color: c.muted, fontSize: 9, marginTop: 4 },
  pill: { borderRadius: 9, paddingHorizontal: 9, paddingVertical: 7 }, pillOn: { backgroundColor: '#E8F5ED' }, pillOff: { backgroundColor: '#FFF1ED' }, pillText: { fontSize: 8, fontWeight: '900' }, pillTextOn: { color: c.green }, pillTextOff: { color: c.red },
  buttonRow: { flexDirection: 'row', gap: 8, marginTop: 10 }, primaryButton: { backgroundColor: c.purple, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9, alignItems: 'center', justifyContent: 'center', marginTop: 10, alignSelf: 'flex-start' }, primaryText: { color: c.white, fontSize: 9, fontWeight: '900' }, secondaryButton: { borderWidth: 1, borderColor: c.border, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', marginTop: 10 }, secondaryText: { color: c.red, fontSize: 9, fontWeight: '900' },
  empty: { color: c.muted, fontSize: 10, paddingVertical: 14 }, state: { alignItems: 'center', justifyContent: 'center', gap: 9, minHeight: 140 }, muted: { color: c.muted, fontSize: 10 }, errorText: { color: c.red, fontSize: 10, textAlign: 'center' },
});
