import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

async function confirmAction({
  title,
  text,
  confirmButtonText,
  icon = 'question',
  confirmButtonColor = '#059669',
  onConfirm
}) {
  const result = await Swal.fire({
    title,
    text,
    icon,
    width: '22rem',
    padding: '1rem',
    background: '#111827',
    color: '#F9FAFB',
    confirmButtonText,
    confirmButtonColor,
    cancelButtonText: 'Cancel',
    showCancelButton: true,
    reverseButtons: true,
    buttonsStyling: true,
    showLoaderOnConfirm: Boolean(onConfirm),
    allowOutsideClick: () => !Swal.isLoading(),
    preConfirm: onConfirm
      ? async () => {
          try {
            await onConfirm();
          } catch (error) {
            Swal.showValidationMessage(error.message || 'Something went wrong');
            throw error;
          }
        }
      : undefined,
    customClass: {
      popup: 'rounded-2xl border border-gray-700 shadow-2xl',
      title: 'text-lg font-semibold',
      htmlContainer: 'text-sm',
      confirmButton: 'rounded-lg px-4 py-2 text-sm font-semibold',
      cancelButton: 'rounded-lg px-4 py-2 text-sm font-semibold'
    }
  });

  return result.isConfirmed;
}

export { confirmAction };
