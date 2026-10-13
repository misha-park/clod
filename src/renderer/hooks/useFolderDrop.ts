import { useEffect, useState } from 'react'
import { useSessionStore } from '../stores/sessionStore'

/** The dropped items' paths: folders, and everything else (files). */
function droppedPaths(dt: DataTransfer): { folders: string[]; files: string[] } {
  const folders: string[] = []
  const files: string[] = []
  for (const item of Array.from(dt.items)) {
    if (item.kind !== 'file') continue
    const entry = item.webkitGetAsEntry?.()
    const file = item.getAsFile()
    const path = file ? window.clod.getPathForFile(file) : ''
    if (!path) continue
    if (entry?.isDirectory) folders.push(path)
    else files.push(path)
  }
  return { folders, files }
}

/**
 * Drag files or a folder from Finder onto Clod. Files are attached to the next
 * message, like the paperclip. A folder is where Claude works: an empty tab
 * switches to it; a tab with a conversation is left alone and a new tab opens there.
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

      const { folders, files } = droppedPaths(e.dataTransfer)
      const attach = async () => {
        if (files.length === 0) return
        const attachments = await window.clod.attachPaths(files).catch(() => [])
        if (attachments.length > 0) useSessionStore.getState().addAttachments(attachments)
      }
      const dir = folders[0]
      if (!dir) { void attach(); return }

      const { tabs, activeTabId, createTab, setBaseDirectory } = useSessionStore.getState()
      const tab = tabs.find((t) => t.id === activeTabId)
      const inUse = !!tab && (
        tab.messages.length > 0 || tab.status === 'running' || tab.status === 'connecting'
      )
      // Any files dropped with the folder go with the tab that works there.
      if (inUse) {
        void createTab().then(() => { useSessionStore.getState().setBaseDirectory(dir); return attach() })
      } else {
        setBaseDirectory(dir)
        void attach()
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
