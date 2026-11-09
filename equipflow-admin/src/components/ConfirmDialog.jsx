import Modal from './Modal'

// "Are you sure?" for an action. `danger` makes the confirm button red. Extra form fields can be
// passed as children. While `busy`, both buttons are disabled so the action cannot be repeated.
export default function ConfirmDialog({ title, confirmLabel, danger = false, busy = false, error, onConfirm, onCancel, children }) {
  return (
    <Modal title={title} onClose={onCancel}>
      {children}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button type="button" className="btn btn-small" data-autofocus disabled={busy} onClick={onCancel}>Cancel</button>
        <button type="button" className={`btn btn-small ${danger ? 'btn-danger-solid' : 'btn-primary'}`} disabled={busy} onClick={onConfirm}>
          {busy ? 'Working...' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
