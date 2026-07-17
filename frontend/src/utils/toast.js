import { createElement } from 'react';
import toast from 'react-hot-toast';

const toastOptions = {
  duration: 3000,
  style: {
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '12px',
    color: '#F9FAFB',
    fontSize: '14px'
  },
  success: {
    iconTheme: {
      primary: '#059669',
      secondary: '#FFFFFF'
    }
  },
  error: {
    iconTheme: {
      primary: '#DC2626',
      secondary: '#FFFFFF'
    }
  }
};

const showSuccessToast = (message) => toast.success(message, toastOptions);
const showErrorToast = (message) => toast.error(message, toastOptions);
const showCopiedNumberToast = ({ phoneNumber, onPaste }) => toast.custom((t) => createElement(
  'div',
  {
    className: `pointer-events-auto flex w-[min(360px,calc(100vw-2rem))] rounded-xl border border-emerald-500/25 bg-[#101827] text-white shadow-2xl transition-all duration-200 ${
      t.visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
    }`
  },
  createElement(
    'div',
    { className: 'min-w-0 flex-1 p-4' },
    createElement('p', { className: 'text-sm font-semibold text-white' }, 'Number copied'),
    createElement('p', { className: 'mt-1 truncate text-sm text-gray-400' }, phoneNumber || 'Phone number')
  ),
  createElement(
    'div',
    { className: 'flex border-l border-white/10' },
    createElement(
      'button',
      {
        type: 'button',
        onClick: () => {
          toast.dismiss(t.id);
          onPaste?.();
        },
        className: 'flex w-full items-center justify-center rounded-r-xl border border-transparent p-4 text-sm font-semibold text-emerald-300 hover:text-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-500'
      },
      'Paste on dialer'
    )
  )
), {
  duration: 5000,
  position: 'top-right'
});
const showIncomingSmsToast = ({ from, body, onClick }) => toast.custom((t) => createElement(
  'div',
  {
    className: `pointer-events-auto flex w-[min(380px,calc(100vw-2rem))] rounded-lg bg-white text-gray-900 shadow-lg ring-1 ring-black/5 transition-all duration-200 ${
      t.visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
    }`
  },
  createElement(
    'button',
    {
      type: 'button',
      onClick: () => {
        toast.dismiss(t.id);
        onClick?.();
      },
      className: 'min-w-0 flex-1 p-4 text-left'
    },
    createElement(
      'div',
      { className: 'flex items-start' },
      createElement(
        'div',
        { className: 'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700' },
        'SMS'
      ),
      createElement(
        'div',
        { className: 'ml-3 min-w-0 flex-1' },
        createElement('p', { className: 'truncate text-sm font-medium text-gray-900' }, from || 'Unknown number'),
        createElement('p', { className: 'mt-1 line-clamp-2 text-sm text-gray-500' }, body || 'New message received')
      )
    )
  ),
  createElement(
    'div',
    { className: 'flex border-l border-gray-200' },
    createElement(
      'button',
      {
        type: 'button',
        onClick: () => toast.dismiss(t.id),
        className: 'flex w-full items-center justify-center rounded-r-lg border border-transparent p-4 text-sm font-medium text-emerald-600 hover:text-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500'
      },
      'Close'
    )
  )
), {
  duration: 5000,
  position: 'top-right'
});
const showTeamMessageToast = ({ senderName, onClick }) => toast.custom((t) => createElement(
  'div',
  {
    className: `pointer-events-auto flex w-[min(360px,calc(100vw-2rem))] rounded-xl border border-sky-500/25 bg-[#101827] text-white shadow-2xl transition-all duration-200 ${
      t.visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
    }`
  },
  createElement(
    'button',
    {
      type: 'button',
      onClick: () => {
        toast.dismiss(t.id);
        onClick?.();
      },
      className: 'min-w-0 flex-1 p-4 text-left'
    },
    createElement(
      'div',
      { className: 'flex items-start' },
      createElement(
        'div',
        { className: 'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-xs font-bold text-sky-300 ring-1 ring-sky-400/20' },
        'TEAM'
      ),
      createElement(
        'div',
        { className: 'ml-3 min-w-0 flex-1' },
        createElement('p', { className: 'truncate text-sm font-semibold text-white' }, 'New team message'),
        createElement('p', { className: 'mt-1 truncate text-sm text-gray-400' }, senderName || 'Team member')
      )
    )
  ),
  createElement(
    'div',
    { className: 'flex border-l border-white/10' },
    createElement(
      'button',
      {
        type: 'button',
        onClick: () => toast.dismiss(t.id),
        className: 'flex w-full items-center justify-center rounded-r-xl border border-transparent p-4 text-sm font-medium text-sky-300 hover:text-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-500'
      },
      'Close'
    )
  )
), {
  duration: 5000,
  position: 'top-right'
});

export { showCopiedNumberToast, showErrorToast, showIncomingSmsToast, showSuccessToast, showTeamMessageToast, toastOptions };
