import type { Workspace } from '../sync/access'
import styles from './WorkspaceSelect.module.css'

interface Props {
  workspaces: Workspace[]
  value: string
  onChange: (id: string) => void
}

/** Elige en qué workspace nace el tablero nuevo (solo si la persona tiene más de uno). */
export function WorkspaceSelect({ workspaces, value, onChange }: Props) {
  if (workspaces.length < 2) return null
  return (
    <label className={styles.wrap}>
      <span className={styles.label}>Workspace</span>
      <select className={styles.select} value={value} onChange={(e) => onChange(e.target.value)}>
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    </label>
  )
}
