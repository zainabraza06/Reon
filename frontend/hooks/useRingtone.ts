import { useRef, useCallback, useEffect } from 'react';

/**
 * Hook for playing ringtone with autoplay-safe handling
 * Uses an <audio> element instead of Web Audio API to avoid autoplay restrictions
 */
export const useRingtone = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  const autoplayFailedRef = useRef<boolean>(false);
  const userInteractionHandlersRef = useRef<Array<() => void>>([]);

  // Create audio element on mount
  useEffect(() => {
    const audio = new Audio('/ringtone.mp3');
    audio.loop = true;
    audio.volume = 0.7;
    
    // Handle autoplay failure and file loading errors
    const handlePlayError = (e: Event) => {
      console.warn('🔇 Ringtone error:', e);
      autoplayFailedRef.current = true;
    };

    const handleLoadError = () => {
      console.warn('⚠️ Ringtone file not found: /ringtone.mp3 - Please add ringtone.mp3 to public folder');
    };

    audio.addEventListener('error', handlePlayError);
    audio.addEventListener('loaderror', handleLoadError);
    
    // Try to preload
    audio.load();
    
    audioRef.current = audio;

    // Set up user interaction handlers for retry
    const handleUserInteraction = () => {
      if (autoplayFailedRef.current && !isPlayingRef.current && audioRef.current) {
        // Retry playback on first user interaction
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log('🔊 Ringtone started after user interaction');
              autoplayFailedRef.current = false;
              isPlayingRef.current = true;
            })
            .catch((err) => {
              console.warn('Failed to play ringtone after user interaction:', err);
            });
        }
      }
    };

    // Add listeners for user interaction
    window.addEventListener('click', handleUserInteraction, { once: true });
    window.addEventListener('keydown', handleUserInteraction, { once: true });
    window.addEventListener('touchstart', handleUserInteraction, { once: true });

    const cleanupHandlers = () => {
      window.removeEventListener('click', handleUserInteraction);
      window.removeEventListener('keydown', handleUserInteraction);
      window.removeEventListener('touchstart', handleUserInteraction);
    };

    return () => {
      // Cleanup
      cleanupHandlers();
      audio.removeEventListener('error', handlePlayError);
      audio.removeEventListener('loaderror', handleLoadError);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
    };
  }, []);

  const playRingtone = useCallback(() => {
    if (!audioRef.current || isPlayingRef.current) {
      return; // Already playing or no audio element
    }

    isPlayingRef.current = true;
    autoplayFailedRef.current = false;

    const playPromise = audioRef.current.play();
    
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          console.log('🔊 Ringtone started');
        })
        .catch((error) => {
          console.warn('🔇 Ringtone autoplay blocked:', error);
          autoplayFailedRef.current = true;
          isPlayingRef.current = false;
        });
    }
  }, []);

  const stopRingtone = useCallback(() => {
    if (!audioRef.current || !isPlayingRef.current) {
      return; // Not playing or no audio element
    }

    isPlayingRef.current = false;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    console.log('🔇 Ringtone stopped');
  }, []);

  return {
    playRingtone,
    stopRingtone,
  };
};
