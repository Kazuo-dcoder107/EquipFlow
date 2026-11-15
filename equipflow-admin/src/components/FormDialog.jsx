import Modal from './Modal'

// A dialog with a form in it: fields as children, a Cancel button and a submit button.
// While `busy` both buttons are disabled so the form cannot be sent twice.
export default function FormDialog({ title, submitLabel = 'Save', busy = false, error, onSubmit, onCancel, danger = false, children }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <form className="dialog-form" onSubmit={(event) => { event.preventDefault(); onSubmit() }}>
        {children}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-small" disabled={busy} onClick={onCancel}>Cancel</button>
          <button type="submit" className={`btn btn-small ${danger ? 'btn-danger-solid' : 'btn-primary'}`} disabled={busy}>
            {busy ? 'Working...' : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  )
}
