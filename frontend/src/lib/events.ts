/** Cross-component UI intents that don't belong in app state. */
export const FOCUS_LOG_EVENT = 'tobox:focus-log'

// A request stays pending until a mounted composer consumes it, so pressing `l` from another
// page still focuses the composer once the Track page has loaded.
let focusLogPending = false

export function requestFocusLog() {
  focusLogPending = true
  window.dispatchEvent(new CustomEvent(FOCUS_LOG_EVENT))
}

export function consumeFocusLog(): boolean {
  const pending = focusLogPending
  focusLogPending = false
  return pending
}
