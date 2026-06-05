import {
  persistQueueVisibility,
} from './queueVisibilityStorage';
import type { PlayerState } from './playerStoreTypes';
import {
  ensurePlaybackServerActive,
  playbackServerDiffersFromActive,
  resolveStreamServerIdForTrack,
} from '../utils/playback/playbackServer';
import { useAuthStore } from './authStore';
import { usePlayerStore } from './playerStore';
import { resolveServerIdForIndexKey } from '../utils/server/serverLookup';

type SetState = (
  partial: Partial<PlayerState> | ((state: PlayerState) => Partial<PlayerState>),
) => void;

/**
 * Pure-UI state setters: no audio engine / network side effects.
 * Add new actions here only if they fit that contract.
 */
export function createUiStateActions(set: SetState): Pick<
  PlayerState,
  | 'setStarredOverride'
  | 'setUserRatingOverride'
  | 'openContextMenu'
  | 'closeContextMenu'
  | 'openSongInfo'
  | 'closeSongInfo'
  | 'toggleQueue'
  | 'setQueueVisible'
  | 'toggleFullscreen'
  | 'toggleRepeat'
> {
  return {
    setStarredOverride: (id, starred) =>
      set(s => ({ starredOverrides: { ...s.starredOverrides, [id]: starred } })),

    setUserRatingOverride: (id, rating) =>
      set(s => {
        const nextOverrides = { ...s.userRatingOverrides };
        if (rating === 0) delete nextOverrides[id];
        else nextOverrides[id] = rating;
        // Thin-state: the queue's copy lives in the resolver cache; the override
        // map (merged on read via applyQueueOverrides) drives the queue-row UI.
        return {
          userRatingOverrides: nextOverrides,
          currentTrack:
            s.currentTrack?.id === id ? { ...s.currentTrack, userRating: rating } : s.currentTrack,
        };
      }),

    openContextMenu: (x, y, item, type, queueIndex, playlistId, playlistSongIndex, shareKindOverride, pinToPlaybackServer) => {
      const pin = pinToPlaybackServer ?? type === 'queue-item';
      const open = () =>
        set({
          contextMenu: {
            isOpen: true,
            x,
            y,
            item,
            type,
            queueIndex,
            playlistId,
            playlistSongIndex,
            shareKindOverride,
            pinToPlaybackServer: pin,
          },
        });
      if (pin && playbackServerDiffersFromActive()) {
        void ensurePlaybackServerActive().then(ok => {
          if (ok) open();
        });
        return;
      }
      open();
    },

    closeContextMenu: () =>
      set(state => ({
        contextMenu: { ...state.contextMenu, isOpen: false },
      })),

    openSongInfo: (songId, serverId) => {
      let sid: string | null = null;
      if (serverId?.trim()) {
        sid = resolveServerIdForIndexKey(serverId) || serverId;
      } else {
        const st = usePlayerStore.getState();
        if (st.currentTrack?.id === songId) {
          sid = resolveStreamServerIdForTrack(
            st.currentTrack,
            st.queueItems[st.queueIndex]?.serverId,
          );
        } else {
          sid = useAuthStore.getState().activeServerId ?? null;
        }
      }
      set({ songInfoModal: { isOpen: true, songId, serverId: sid } });
    },
    closeSongInfo: () => set({ songInfoModal: { isOpen: false, songId: null, serverId: null } }),

    toggleQueue: () =>
      set(state => {
        const next = !state.isQueueVisible;
        persistQueueVisibility(next);
        return { isQueueVisible: next };
      }),

    setQueueVisible: (v: boolean) => {
      persistQueueVisibility(v);
      set({ isQueueVisible: v });
    },

    toggleFullscreen: () => set(state => ({ isFullscreenOpen: !state.isFullscreenOpen })),

    toggleRepeat: () =>
      set(state => {
        const modes = ['off', 'all', 'one'] as const;
        return { repeatMode: modes[(modes.indexOf(state.repeatMode) + 1) % modes.length] };
      }),
  };
}
