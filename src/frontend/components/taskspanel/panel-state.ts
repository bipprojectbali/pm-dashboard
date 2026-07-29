import type { useTasksPanelState } from './useTasksPanelState'

// The full state object returned by useTasksPanelState — passed whole to the
// Header/Body sub-components so they don't each re-declare ~70 individual props.
export type TasksPanelState = ReturnType<typeof useTasksPanelState>
