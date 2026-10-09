import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { NotePencil } from '@phosphor-icons/react'
import { useSessionStore } from '../stores/sessionStore'
import { useColors } from '../theme'
import { GROUP_HEX } from './TabStrip'

/**
 * Write or change a group's note: shared by every chat in the group (Claude
 * sees it with each message). Opens by itself when a group is made.
 */
export function GroupNoteEditor() {
  const groupId = useSessionStore((s) => s.noteEditorGroupId)
  const group = useSessionStore((s) => s.groups.find((g) => g.id === s.noteEditorGroupId))
  const setNoteEditor = useSessionStore((s) => s.setNoteEditor)
  const setGroupNote = useSessionStore((s) => s.setGroupNote)
  const colors = useColors()
  const [draft, setDraft] = useState(group?.note ?? '')
  const boxRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { setDraft(group?.note ?? ''); boxRef.current?.focus() }, [groupId]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!group) return null

  const close = () => setNoteEditor(null)
  const save = () => { setGroupNote(group.id, draft); close() }
  const isNew = !group.note

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12 }}
      className="absolute left-3 right-3 z-40 overflow-hidden"
      style={{ top: 44, background: colors.containerBg, border: `1px solid ${colors.containerBorder}`, borderRadius: 16, boxShadow: colors.cardShadow }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save() }
      }}
    >
      <div className="flex items-center gap-2 px-3.5 pt-3 text-[12.5px] font-medium" style={{ color: colors.textPrimary }}>
        <span className="w-[8px] h-[8px] rounded-full" style={{ background: GROUP_HEX[group.color] }} />
        <NotePencil size={13} style={{ color: colors.textTertiary }} />
        <span className="truncate">Group note{group.name ? ` · ${group.name}` : ''}</span>
      </div>
      <p className="px-3.5 pt-1 text-[11.5px] leading-[1.45]" style={{ color: colors.textTertiary }}>
        Every chat in this group sees this note, and Claude can update it when you ask. Good for what the group is about, preferences, and where things are.
      </p>
      <div className="px-3.5 pt-2">
        <textarea
          ref={boxRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          maxLength={4000}
          placeholder="e.g. My dissertation on sleep and memory. Write in British English. Sources are in the Research folder."
          className="w-full resize-none outline-none text-[12.5px] leading-[1.5] px-3 py-2"
          style={{ background: colors.surfaceHover, color: colors.textPrimary, border: `1px solid ${colors.containerBorder}`, borderRadius: 10 }}
        />
      </div>
      <div className="flex items-center justify-end gap-1.5 px-3.5 pb-3 pt-1.5 text-[11.5px]">
        <button onClick={close} className="px-2.5 py-1 rounded-md" style={{ color: colors.textSecondary }}>{isNew ? 'Skip' : 'Cancel'}</button>
        <button onClick={save} className="px-2.5 py-1 rounded-md font-medium" style={{ background: colors.accent, color: '#fff' }}>Save note</button>
      </div>
    </motion.div>
  )
}
