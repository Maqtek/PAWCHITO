import { Modal } from '../../components/ui'
import { ChangePasswordForm } from '../auth/ChangePasswordForm'

interface ChangePasswordModalProps {
  open: boolean
  onClose: () => void
  onChanged: () => void
}

export function ChangePasswordModal({ open, onClose, onChanged }: ChangePasswordModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Смена пароля">
      {/* Форма монтируется при каждом открытии — поля пустые, прошлые ошибки не остаются. */}
      {open && <ChangePasswordForm currentLabel="Текущий пароль" onSuccess={onChanged} onCancel={onClose} />}
    </Modal>
  )
}
