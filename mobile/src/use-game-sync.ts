import { useEffect, useRef } from 'react';
import { ApiError, waitForGame } from './api';
import { syncRetryDelay } from './sync-retry';
import type { GameView } from './types';

type GameSyncCallbacks = {
  onGame: (game: GameView) => void;
  onConnected?: () => void;
  onError?: (error: unknown, terminal: boolean) => void;
};

/** Receives immediate game changes and refreshes at most every five seconds for server timeout enforcement. */
export function useGameSync(game: GameView | null, callbacks: GameSyncCallbacks) {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    if (!game || game.phase === 'finished') return;
    const controller = new AbortController();
    const { signal } = controller;

    async function synchronize() {
      let version = game!.sequence;
      let failureCount = 0;
      while (!signal.aborted) {
        try {
          const result = await waitForGame(game!.id, version, signal, 5_000);
          if (signal.aborted) return;
          failureCount = 0;
          callbacksRef.current.onConnected?.();
          version = result.version;
          if (!result.changed) continue;
          callbacksRef.current.onGame(result.game);
          if (result.game.phase === 'finished') return;
        } catch (error) {
          if (signal.aborted) return;
          const terminal = error instanceof ApiError && [401, 403, 404].includes(error.status);
          callbacksRef.current.onError?.(error, terminal);
          if (terminal) return;
          failureCount += 1;
          await syncRetryDelay(signal, failureCount);
        }
      }
    }

    void synchronize();
    return () => controller.abort();
  }, [game?.id, game?.phase]);
}
