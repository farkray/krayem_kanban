import type { Workspace } from '../sync/access'
import { Select } from './Select'
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
    <Select
      className={styles.wrap}
      label="Workspace"
      value={value}
      options={workspaces.map((w) => ({ value: w.id, label: w.name }))}
      onChange={onChange}
    />
  )
}
