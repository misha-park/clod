import { useEffect, useState } from 'react'
import { useSessionStore } from '../stores/sessionStore'

/** Find the first dropped item that is a folder and return its absolute path. */
function droppedFolderPath(dt: DataTransfer): string | null {
  for (const item of Array.from(dt.items)) {
    if (item.kind !== 'file') continue
    const entry = item.webkitGetAsEntry?.()
    if (!entry?.isDirectory) continue
    const file = item.getAsFile()
    const path = file ? window.clod.getPathForFile(file) : ''
    if (path) return path
  }
  return null
}

/**
 * Drag a folder from Finder onto Clod to work in it. An empty tab switches to
 * the folder; a tab with a conversation is left alone and a new tab opens there.
 * Returns true while files are being dragged over the window, for a visual cue.
 */
export function useFolderDrop(): boolean {
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    // dragenter/dragleave fire for every child element, so count them.
    let depth = 0
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files')

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setDragging(true)
    }
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault() // required for the drop event to fire
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e) || !e.dataTransfer) return
      e.preventDefault()
      depth = 0
      setDragging(false)

      const dir = droppedFolderPath(e.dataTransfer)
      if (!dir) return

      const { tabs, activeTabId, createTab, setBaseDirectory } = useSessionStore.getState()
      const tab = tabs.find((t) => t.id === activeTabId)
      const inUse = !!tab && (
        tab.messages.length > 0 || tab.status === 'running' || tab.status === 'connecting'
      )
      if (inUse) {
        void createTab().then(() => useSessionStore.getState().setBaseDirectory(dir))
      } else {
        setBaseDirectory(dir)
      }
    }

    document.addEventListener('dragenter', onDragEnter)
    document.addEventListener('dragover', onDragOver)
    document.addEventListener('dragleave', onDragLeave)
    document.addEventListener('drop', onDrop)
    return () => {
      document.removeEventListener('dragenter', onDragEnter)
      document.removeEventListener('dragover', onDragOver)
      document.removeEventListener('dragleave', onDragLeave)
      document.removeEventListener('drop', onDrop)
    }
  }, [])

  return dragging
}
