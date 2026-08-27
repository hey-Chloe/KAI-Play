import { useEffect, useRef } from 'react';
import { ApiError, getGame, waitForRoom } from './api';
import { syncRetryDelay } from './sync-retry';
import type { GameView, RoomView } from './types';

type RoomSyncCallbacks = {
  onRoom: (room: RoomView) => void;
  onGame: (game: GameView) => void;
  onConnected?: () => void;
  onError?: (error: unknown, terminal: boolean) => void;
};

/** Keeps a waiting friend room current without fixed-interval polling. */
export function useRoomSync(room: RoomView | null, callbacks: RoomSyncCallbacks) {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    if (!room || room.status !== 'waiting') return;
    const controller = new AbortController();
    const { signal } = controller;

    async function synchronize() {
      let version = room!.version;
      let failureCount = 0;
      while (!signal.aborted) {
        try {
          const result = await waitForRoom(room!.id, version, signal);
          if (signal.aborted) return;
          failureCount = 0;
          callbacksRef.current.onConnected?.();
          version = result.version;
          if (!result.changed) continue;
          if (result.room.status === 'playing' && result.room.gameId) {
            const game = await getGame(result.room.gameId, signal);
            if (!signal.aborted) callbacksRef.current.onGame(game);
            return;
          }
          callbacksRef.current.onRoom(result.room);
          if (result.room.status !== 'waiting') return;
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
  }, [room?.id, room?.status]);
}
