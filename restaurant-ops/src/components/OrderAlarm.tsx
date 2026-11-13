import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import type { AudioPlayer } from 'expo-audio';

export default function OrderAlarm({ active }: { active: boolean }) {
  const playerRef = useRef<AudioPlayer | null>(null);
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeRef = useRef(active);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // Setup Web Audio (for browser counter dashboard)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    try {
      const audio = new Audio('/assets/order_alert.wav');
      audio.loop = true;
      audio.volume = 1.0;
      webAudioRef.current = audio;
    } catch {
      // Audio not supported in this environment
    }

    return () => {
      if (webAudioRef.current) {
        webAudioRef.current.pause();
        webAudioRef.current = null;
      }
    };
  }, []);

  // Setup Native Audio (for Android / iOS staff app)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;

    void import('expo-audio')
      .then(({ createAudioPlayer }) => {
        if (cancelled) return;
        const player = createAudioPlayer(require('../../assets/order_alert.wav'));
        player.loop = true;
        player.volume = 1.0;
        playerRef.current = player;
        if (activeRef.current) player.play();
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      playerRef.current?.pause();
      playerRef.current?.remove();
      playerRef.current = null;
    };
  }, []);

  // Play / Pause based on active orders awaiting acceptance
  useEffect(() => {
    // Handle Web
    if (Platform.OS === 'web' && webAudioRef.current) {
      if (active) {
        webAudioRef.current.play().catch(() => {
          // Autoplay blocked until first user interaction
        });
      } else {
        webAudioRef.current.pause();
        webAudioRef.current.currentTime = 0;
      }
    }

    // Handle Native
    const player = playerRef.current;
    if (player) {
      if (active) {
        player.play();
      } else {
        player.pause();
      }
    }
  }, [active]);

  return null;
}
