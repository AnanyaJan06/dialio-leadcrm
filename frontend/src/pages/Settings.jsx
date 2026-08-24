import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { AppSkeletonTheme, Skeleton } from '../components/ui/AppSkeleton.jsx';
import InlineLoader from '../components/ui/InlineLoader.jsx';
import { confirmAction } from '../utils/confirmDialog.js';
import { showErrorToast, showSuccessToast } from '../utils/toast.js';

import { BACKEND_URL } from '../config/api.js';

function SettingsSkeleton() {
  return (
    <AppSkeletonTheme>
      <div className="mx-auto max-w-xl" role="status" aria-label="Loading settings">
        <div className="mb-4 rounded-2xl border border-gray-700 bg-gray-900 p-4">
          <Skeleton width={142} height={18} className="mb-4 block" />
          <div className="space-y-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index}>
                <Skeleton width={72} height={12} />
                <Skeleton width={index === 1 ? '72%' : '44%'} height={16} className="mt-2 block" />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-700 bg-gray-900 p-4">
          <Skeleton width={132} height={18} className="mb-4 block" />
          <div className="space-y-4">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index}>
                <Skeleton width={116} height={12} />
                <Skeleton height={44} borderRadius={12} className="mt-2 block" />
              </div>
            ))}
            <Skeleton height={44} borderRadius={12} />
          </div>
        </div>
      </div>
    </AppSkeletonTheme>
  );
}

function Settings() {
  const [user, setUser] = useState(null);
  const [assignedNumbers, setAssignedNumbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingDefault, setSavingDefault] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingAiStatus, setSavingAiStatus] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const headers = {
          Authorization: `Bearer ${localStorage.getItem('token')}`
        };

        const [userRes, numbersRes] = await Promise.all([
          fetch(`${BACKEND_URL}/api/auth/me`, { headers }),
          fetch(`${BACKEND_URL}/api/phone-numbers/me`, { headers })
        ]);

        if (userRes.ok) {
          const data = await userRes.json();
          setUser(data);
        } else {
          throw new Error('Failed to load profile');
        }

        if (numbersRes.ok) {
          const data = await numbersRes.json();
          setAssignedNumbers(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        showErrorToast(error.message || 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  const defaultNumberId = assignedNumbers.find((number) => (
    number.sid === user?.assignedPhoneNumberSid || number.phoneNumber === user?.assignedPhoneNumber
  ))?.id || '';

  const handleDefaultNumberChange = async (event) => {
    const numberId = event.target.value;
    if (!numberId) return;

    const selectedNumber = assignedNumbers.find((number) => (
      String(number.id || number._id) === String(numberId)
    ));

    const confirmed = await confirmAction({
      title: 'Change default sender?',
      text: selectedNumber?.phoneNumber
        ? `${selectedNumber.phoneNumber} will be used for outbound SMS.`
        : 'This number will be used for outbound SMS.',
      confirmButtonText: 'Change'
    });

    if (!confirmed) return;

    try {
      setSavingDefault(true);
      const res = await fetch(`${BACKEND_URL}/api/phone-numbers/me/default`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ numberId })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || 'Failed to update default number');

      setUser((current) => ({
        ...current,
        assignedPhoneNumber: data.phoneNumber,
        assignedPhoneNumberSid: data.sid
      }));
      showSuccessToast(`${data.phoneNumber} is now your default sender`);
    } catch (error) {
      showErrorToast(error.message || 'Failed to update default number');
    } finally {
      setSavingDefault(false);
    }
  };

  const handleToggleAiReply = async () => {
    const nextStatus = !(user?.isAiAutoReplyActive !== false);
    try {
      setSavingAiStatus(true);
      const res = await fetch(`${BACKEND_URL}/api/auth/me/ai-reply-status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ active: nextStatus })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update AI auto-reply status');

      setUser((current) => ({
        ...current,
        isAiAutoReplyActive: data.user?.isAiAutoReplyActive
      }));
      showSuccessToast(data.message || `AI Auto-Reply ${nextStatus ? 'ON' : 'OFF'}`);
    } catch (error) {
      showErrorToast(error.message || 'Failed to update AI auto-reply status');
    } finally {
      setSavingAiStatus(false);
    }
  };

  const handleChangePassword = async (event) => {
    event.preventDefault();

    if (newPassword !== confirmPassword) {
      showErrorToast('New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      showErrorToast('Password must be at least 6 characters');
      return;
    }

    const confirmed = await confirmAction({
      title: 'Change password?',
      text: 'You will use the new password the next time you sign in.',
      confirmButtonText: 'Change Password'
    });

    if (!confirmed) return;

    try {
      setSavingPassword(true);
      const res = await fetch(`${BACKEND_URL}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      });

      if (!res.ok) {
        throw new Error('Failed to change password. Check current password.');
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showSuccessToast('Password changed successfully');
    } catch (error) {
      showErrorToast(error.message || 'Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return <SettingsSkeleton />;
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 rounded-2xl border border-gray-700 bg-gray-900 p-4">
        <h3 className="mb-4 text-base font-semibold text-white">Profile Information</h3>
        <div className="space-y-4">
          <div>
            <p className="text-xs text-gray-400">Name</p>
            <p className="text-sm font-medium text-white">{user?.name || 'N/A'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Email</p>
            <p className="break-all text-sm font-medium text-white">{user?.email || 'N/A'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Role</p>
            <p className="text-sm font-medium capitalize text-white">{user?.role || 'Agent'}</p>
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-gray-400">Default Number</label>
            {assignedNumbers.length > 0 ? (
              <div className="flex gap-2">
                <select
                  value={defaultNumberId}
                  onChange={handleDefaultNumberChange}
                  disabled={savingDefault}
                  className="min-w-0 flex-1 rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white focus:border-[#059669] disabled:opacity-60"
                >
                  {assignedNumbers.map((number) => (
                    <option key={number.id || number._id || number.sid} value={number.id || number._id}>
                      {number.phoneNumber}
                    </option>
                  ))}
                </select>
                {savingDefault && (
                  <span className="flex items-center rounded-xl border border-gray-700 px-3 text-xs text-gray-300">
                    <InlineLoader label="Saving..." size="xs" />
                  </span>
                )}
              </div>
            ) : (
              <p className="text-sm font-medium text-white">No numbers allotted</p>
            )}
          </div>
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-gray-700 bg-gray-900 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-400" />
              <h3 className="text-base font-semibold text-white">AI Agent Auto-Reply</h3>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              When enabled, the AI agent automatically replies to incoming SMS from your assigned leads when you are away or offline.
            </p>
          </div>

          <button
            type="button"
            onClick={handleToggleAiReply}
            disabled={savingAiStatus}
            aria-label="Toggle AI Agent Auto-Reply"
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-60 ${
              user?.isAiAutoReplyActive !== false ? 'bg-[#059669]' : 'bg-gray-700'
            }`}
            role="switch"
            aria-checked={user?.isAiAutoReplyActive !== false}
            title={user?.isAiAutoReplyActive !== false ? 'Turn AI Auto-Reply OFF' : 'Turn AI Auto-Reply ON'}
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                user?.isAiAutoReplyActive !== false ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-gray-800 pt-3">
          <span className="text-xs text-gray-400">AI Status for your leads:</span>
          <div className="flex items-center gap-2">
            {savingAiStatus && <InlineLoader label="Saving..." size="xs" />}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                user?.isAiAutoReplyActive !== false
                  ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border border-gray-700 bg-gray-800 text-gray-400'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  user?.isAiAutoReplyActive !== false ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'
                }`}
              />
              {user?.isAiAutoReplyActive !== false ? 'AI Agent ON' : 'AI Agent OFF'}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-700 bg-gray-900 p-4">
        <h3 className="mb-4 text-base font-semibold text-white">Change Password</h3>

        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs text-gray-400">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white focus:border-[#059669]"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-gray-400">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white focus:border-[#059669]"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-gray-400">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white focus:border-[#059669]"
              required
            />
          </div>

          <button
            type="submit"
            disabled={savingPassword}
            className="w-full rounded-xl bg-[#059669] py-3 text-sm font-semibold text-white transition hover:bg-[#047857] disabled:opacity-60"
          >
            {savingPassword ? <InlineLoader label="Changing..." /> : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Settings;
