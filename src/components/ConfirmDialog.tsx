import type { ReactNode } from 'react'
import { Modal } from './Modal'
import styles from './ConfirmDialog.module.css'

interface Props {
  title: string
  children?: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ title, children, confirmLabel, onConfirm, onCancel }: Props) {
  return (
    <Modal label={title} onClose={onCancel} alert>
      <h2 className={styles.title}>{title}</h2>
      <div className={styles.body}>{children}</div>
      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={onCancel}>
          Cancelar
        </button>
        <button type="button" className={styles.danger} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
