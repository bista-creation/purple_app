import { useEffect, useRef } from 'react';
import { Platform, Vibration } from 'react-native';
import type { AudioPlayer } from 'expo-audio';
import { Asset } from 'expo-asset';

export type OrderAlarmProps = {
  active: boolean;
  vibrate?: boolean;
  testSignal?: number;
  onAutoplayBlockedChange?: (blocked: boolean) => void;
};

// Vibrate pattern: wait 0ms, vibrate 800ms, pause 300ms, vibrate 800ms, pause 300ms, vibrate 1000ms
const URGENT_VIBRATE_PATTERN = [0, 800, 300, 800, 300, 1000];

export default function OrderAlarm({
  active,
  vibrate = true,
  testSignal = 0,
  onAutoplayBlockedChange,
}: OrderAlarmProps) {
  const playerRef = useRef<AudioPlayer | null>(null);
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeRef = useRef(active);
  const testTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // Setup Web Audio (for browser counter dashboard)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    try {
      const asset = Asset.fromModule(require('../../assets/order_alert.wav'));
      const audioUrl = asset?.uri || '/assets/order_alert.wav';
      const audio = new Audio(audioUrl);
      audio.loop = true;
      audio.volume = 1.0;
      webAudioRef.current = audio;
    } catch {
      // Audio element not supported in this environment
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
        if (activeRef.current) {
          player.play();
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      playerRef.current?.pause();
      playerRef.current?.remove();
      playerRef.current = null;
    };
  }, []);

  // Handle Active Order Alert (Audio + Continuous Vibration)
  useEffect(() => {
    // 1. Web Audio handling
    if (Platform.OS === 'web' && webAudioRef.current) {
      if (active) {
        webAudioRef.current
          .play()
          .then(() => {
            onAutoplayBlockedChange?.(false);
          })
          .catch((err) => {
            if (err?.name === 'NotAllowedError') {
              onAutoplayBlockedChange?.(true);
            }
          });
      } else {
        webAudioRef.current.pause();
        webAudioRef.current.currentTime = 0;
      }
    }

    // 2. Native Audio handling
    const player = playerRef.current;
    if (player) {
      if (active) {
        player.play();
      } else {
        player.pause();
      }
    }

    // 3. Foreground Vibration Pattern
    if (active && vibrate && Platform.OS !== 'web') {
      try {
        Vibration.vibrate(URGENT_VIBRATE_PATTERN, true);
      } catch {
        // Device without vibrator or permission restricted
      }
    } else if (!active && Platform.OS !== 'web') {
      try {
        Vibration.cancel();
      } catch {
        // ignore
      }
    }

    return () => {
      if (Platform.OS !== 'web') {
        try {
          Vibration.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [active, vibrate, onAutoplayBlockedChange]);

  // Handle Test Signal (short 3.5s ring to test volume & vibration)
  useEffect(() => {
    if (testSignal <= 0) return;

    if (testTimerRef.current) {
      clearTimeout(testTimerRef.current);
    }

    // Play Web test
    if (Platform.OS === 'web' && webAudioRef.current) {
      webAudioRef.current.currentTime = 0;
      webAudioRef.current
        .play()
        .then(() => onAutoplayBlockedChange?.(false))
        .catch(() => onAutoplayBlockedChange?.(true));
    }

    // Play Native test
    if (playerRef.current) {
      playerRef.current.play();
    }

    if (vibrate && Platform.OS !== 'web') {
      Vibration.vibrate([0, 500, 200, 500, 200, 500], false);
    }

    testTimerRef.current = setTimeout(() => {
      if (!activeRef.current) {
        if (Platform.OS === 'web' && webAudioRef.current) {
          webAudioRef.current.pause();
          webAudioRef.current.currentTime = 0;
        }
        playerRef.current?.pause();
      }
    }, 3500);

    return () => {
      if (testTimerRef.current) {
        clearTimeout(testTimerRef.current);
      }
    };
  }, [testSignal, vibrate, onAutoplayBlockedChange]);

  return null;
}
