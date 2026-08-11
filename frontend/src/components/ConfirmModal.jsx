import { CircleCheck, TriangleAlert } from 'lucide-react';
function ConfirmModal({
  open,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'primary',
  onCancel,
  onConfirm
}) {
  if (!open) return null;

  const variantStyles = {
    primary: {
      icon: 'text-emerald-300 bg-[#059669]/15 ring-emerald-500/20',
      button: 'bg-[#059669] hover:bg-[#047857]'
    },
    danger: {
      icon: 'text-red-300 bg-red-500/15 ring-red-500/20',
      button: 'bg-red-600 hover:bg-red-700'
    },
    success: {
      icon: 'text-emerald-300 bg-emerald-500/15 ring-emerald-500/20',
      button: 'bg-emerald-600 hover:bg-emerald-700'
    }
  }[variant];

  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div
        className="modal-panel w-full max-w-sm rounded-2xl border border-gray-700 bg-[#151B28] p-6 text-center shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
      >
        <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ring-1 ${variantStyles.icon}`}>
                    {variant === 'danger' ? (
            <TriangleAlert className="h-6 w-6" strokeWidth={2.2} aria-hidden="true" />
          ) : (
            <CircleCheck className="h-6 w-6" strokeWidth={2.2} aria-hidden="true" />
          )}
        </div>

        <h3 id="confirm-modal-title" className="mb-2 text-lg font-semibold text-white">
          {title}
        </h3>
        <p className="mb-6 text-sm leading-6 text-gray-400">
          {message}
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl bg-gray-700 py-2.5 text-sm font-medium text-white transition hover:bg-gray-600"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition ${variantStyles.button}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;
