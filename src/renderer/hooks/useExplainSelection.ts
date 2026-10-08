import { useEffect } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import { explainPrompt } from '../../shared/explain'

/** Shows Clod's offer to report a problem it noticed. */
export function useProblemPrompts(): void {
  useEffect(() => window.clod.onProblemDetected((summary) => {
    useSessionStore.getState().addReportPrompt(summary)
  }), [])
}

/**
 * Handles the "explain selection" shortcut: sends the selected text to Claude
 * in a fresh tab (or the current one, if it's empty and idle).
 */
export function useExplainSelection(): void {
  useEffect(() => window.clod.onExplainSelection(async (text, reason) => {
    const store = useSessionStore.getState()
    useSessionStore.setState({ isExpanded: true })
    if (!text) {
      store.addSystemMessage(reason === 'accessibility'
        ? 'Clod needs the Accessibility permission to read selected text. Allow it in Settings → Permissions.'
        : 'Select some text in any app first, then press the shortcut again.')
      return
    }
    const tab = store.tabs.find((t) => t.id === store.activeTabId)
    const busy = tab?.status === 'running' || tab?.status === 'connecting'
    if (!tab || busy || tab.messages.length > 0) await store.createTab()
    useSessionStore.getState().sendMessage(explainPrompt(text))
  }), [])
}
