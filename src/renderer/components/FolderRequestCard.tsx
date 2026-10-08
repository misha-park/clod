import { useState } from 'react'
import { motion } from 'framer-motion'
import { FolderSimple } from '@phosphor-icons/react'
import { useColors } from '../theme'
import { useSessionStore } from '../stores/sessionStore'

const home = (p: string) => p.replace(/^\/Users\/[^/]+/, '~')

/** Claude asks to work in a folder the user mentioned: pick a match, choose another, or say not now. */
export function FolderRequestCard({ tabId }: { tabId: string }) {
  const colors = useColors()
  const request = useSessionStore((s) => s.tabs.find((t) => t.id === tabId)?.folderRequest)
  const respondFolder = useSessionStore((s) => s.respondFolder)
  const [picked, setPicked] = useState(0)
  if (!request) return null
  const chosen = request.matches[picked]

  const chooseAnother = async () => {
    const dir = await window.clod.selectDirectory()
    if (dir) respondFolder(tabId, dir)
  }
  const button = (label: string, onClick: () => void, kind: 'allow' | 'other' | 'deny') => (
    <button
      onClick={onClick}
      className="text-[11px] font-medium px-3 py-1.5 rounded-full"
      style={kind === 'allow'
        ? { background: colors.permissionAllowBg, color: colors.statusComplete, border: `1px solid ${colors.permissionAllowBorder}` }
        : kind === 'deny'
          ? { background: colors.permissionDenyBg, color: colors.statusError, border: `1px solid ${colors.permissionDenyBorder}` }
          : { background: colors.accentLight, color: colors.accent, border: `1px solid ${colors.accentSoft}` }}
    >{label}</button>
  )

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="mx-4 mt-2 mb-2">
      <div className="overflow-hidden" style={{ background: colors.containerBg, border: `1px solid ${colors.permissionBorder}`, borderRadius: 12, boxShadow: colors.permissionShadow }}>
        <div className="flex items-center gap-1.5 px-3 py-1.5" style={{ background: colors.permissionHeaderBg, borderBottom: `1px solid ${colors.permissionHeaderBorder}` }}>
          <FolderSimple size={12} style={{ color: colors.statusPermission }} />
          <span className="text-[11px] font-semibold" style={{ color: colors.statusPermission }}>Claude wants to work in a folder</span>
        </div>
        <div className="px-3 py-2.5">
          {request.reason && <p className="text-[11.5px] leading-[1.45] mb-2" style={{ color: colors.textSecondary }}>{request.reason}</p>}
          {request.matches.length === 0 ? (
            <p className="text-[11.5px] mb-2" style={{ color: colors.textSecondary }}>
              No folder called “{request.name}” was found. Choose it yourself, or say not now.
            </p>
          ) : (
            <div className="flex flex-col gap-1 mb-2">
              {request.matches.map((m, i) => (
                <button key={m.path} onClick={() => setPicked(i)} className="flex items-center gap-2 text-left px-2 py-1.5 rounded-lg"
                  style={{ background: i === picked ? colors.surfaceHover : 'transparent', border: `1px solid ${i === picked ? colors.accentSoft : 'transparent'}` }}>
                  <FolderSimple size={13} style={{ color: colors.accent, flexShrink: 0 }} />
                  <span className="text-[12px] font-medium" style={{ color: colors.textPrimary }}>{m.name}</span>
                  <span className="text-[10.5px] truncate" style={{ color: colors.textTertiary }}>{home(m.path)}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            {chosen && button(`Allow “${chosen.name}”`, () => respondFolder(tabId, chosen.path), 'allow')}
            {button('Choose another…', chooseAnother, 'other')}
            {button('Not now', () => respondFolder(tabId, null), 'deny')}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
