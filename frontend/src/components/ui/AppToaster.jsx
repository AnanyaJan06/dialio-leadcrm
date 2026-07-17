import { Toaster } from 'react-hot-toast';
import { toastOptions } from '../../utils/toast.js';

function AppToaster() {
  return (
    <Toaster
      position="top-right"
      reverseOrder={false}
      toastOptions={toastOptions}
    />
  );
}

export default AppToaster;
