import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { QueryClient } from '@tanstack/react-query';
import { getRealtimeCredentials } from './api';

export async function connectOrderStream(queryClient: QueryClient, accessToken: string) {
  let client: SupabaseClient | null = null;
  let channel: RealtimeChannel | null = null;
  let closed = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const authorize = async () => {
    try {
      const credentials = await getRealtimeCredentials();
      if (closed) return;
      if (!client) {
        client = createClient(credentials.url, credentials.anonKey, { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'purplehaze-operations-realtime' }, realtime: { params: { eventsPerSecond: 10 } } });
        await client.realtime.setAuth(credentials.token);
        channel = client.channel('admin-orders')
          .on('broadcast', { event: 'order.created' }, () => { void queryClient.invalidateQueries({ queryKey: ['staff-orders'] }); void queryClient.invalidateQueries({ queryKey: ['dispatch-board'] }); })
          .on('broadcast', { event: 'order.status_updated' }, () => { void queryClient.invalidateQueries({ queryKey: ['staff-orders'] }); void queryClient.invalidateQueries({ queryKey: ['dispatch-board'] }); })
          .subscribe();
      } else await client.realtime.setAuth(credentials.token);
    } catch { /* The staff queue keeps polling if Realtime is unavailable. */ }
  };
  if (!accessToken) return () => undefined;
  await authorize();
  timer = setInterval(() => { void authorize(); }, 10 * 60_000);
  return () => { closed = true; if (timer) clearInterval(timer); if (channel) void channel.unsubscribe(); client = null; channel = null; };
}
