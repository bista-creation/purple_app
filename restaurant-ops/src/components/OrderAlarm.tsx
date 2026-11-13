import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import type { AudioPlayer } from 'expo-audio';

export default function OrderAlarm({ active }: { active: boolean }) {
  const playerRef = useRef<AudioPlayer | null>(null);
  const activeRef = useRef(active);
  useEffect(() => { activeRef.current = active; }, [active]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    void import('expo-audio').then(({ createAudioPlayer }) => {
      if (cancelled) return;
      const player = createAudioPlayer(require('../../assets/order_alert.wav'));
      player.loop = true;
      player.volume = 1;
      playerRef.current = player;
      if (activeRef.current) player.play();
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      playerRef.current?.pause();
      playerRef.current?.remove();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    if (active) player.play();
    else player.pause();
  }, [active]);

  return null;
}
