import { useCallback, useRef, useState, useEffect } from 'react';
import { ArrowLeft, CalendarCheck, LayoutDashboard, Menu, MessageSquare, Moon, PhoneCall, Plus, Settings as SettingsIcon, Sun, TableProperties, Users, UsersRound, Wrench, X } from 'lucide-react';
import { io } from 'socket.io-client';
import Dialer from './components/Dialer.jsx';
import CallHistory from './components/CallHistory.jsx';
import Contacts from './components/Contacts.jsx';
import ConversationDetails from './components/ConversationDetails.jsx';
import Messages from './components/Messages.jsx';
import InternalMessages, { InternalMessageDetails } from './components/InternalMessages.jsx';
import AdminDashboard from './components/AdminDashboard.jsx';
import FollowUps from './components/FollowUps.jsx';
import CRM from './components/CRM.jsx';
import Parts from './components/Parts.jsx';
import AppToaster from './components/ui/AppToaster.jsx';
import Settings from './pages/Settings.jsx';
import Login from './pages/Login.jsx';
import { confirmAction } from './utils/confirmDialog.js';
import {
  dismissFollowUpReminderToast,
  showFollowUpReminderToast,
  showIncomingSmsToast,
  showSuccessToast,
  showTeamMessageToast
} from './utils/toast.js';
import { normalizePhone, formatPhoneNumber } from './utils/phone.js';
import './App.css';
import { BACKEND_URL } from './config/api.js';

const getUserId = (user) => String(user?.id || user?._id || '');
const getUnreadMessagesKey = (userId) => `unreadMessages:${userId}`;
const getUnreadSmsThreadsKey = (userId) => `unreadSmsThreads:${userId}`;

const readJsonResponse = async (res) => {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return null;
  }
};

const followUpAlarm = {
  audioContext: null,
  intervalId: null
};

/** Repeating soft two-tone beep generated in the browser (no audio file). */
const playFollowUpBeep = () => {
  try {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;

    if (!followUpAlarm.audioContext || followUpAlarm.audioContext.state === 'closed') {
      followUpAlarm.audioContext = new AudioContextCtor();
    }

    const ctx = followUpAlarm.audioContext;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.setValueAtTime(1174.66, now + 0.12);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.start(now);
    oscillator.stop(now + 0.36);
  } catch (err) {
    console.info('Follow-up reminder sound failed:', err);
  }
};

const startFollowUpReminderAlarm = () => {
  if (followUpAlarm.intervalId) return;

  playFollowUpBeep();
  followUpAlarm.intervalId = window.setInterval(playFollowUpBeep, 1200);
};

const stopFollowUpReminderAlarm = () => {
  if (followUpAlarm.intervalId) {
    window.clearInterval(followUpAlarm.intervalId);
    followUpAlarm.intervalId = null;
  }

  if (followUpAlarm.audioContext && followUpAlarm.audioContext.state !== 'closed') {
    void followUpAlarm.audioContext.close();
  }
  followUpAlarm.audioContext = null;
};
function NavIcon({ type }) {
  const icons = {
    history: PhoneCall,
    contacts: Users,
    messages: MessageSquare,
    crm: TableProperties,
    team: UsersRound,
    followups: CalendarCheck,
    parts: Wrench,
    admin: LayoutDashboard,
    settings: SettingsIcon,
    plus: Plus,
    sun: Sun,
    moon: Moon,
    menu: Menu,
    x: X,
    back: ArrowLeft
  };

  const Icon = icons[type] || PhoneCall;
  return <Icon className="h-5 w-5" aria-hidden="true" />;
}
function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [activeTab, setActiveTab] = useState('history');
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState('');
  const [selectedMessageNumber, setSelectedMessageNumber] = useState('');
  const [selectedMessageLeadId, setSelectedMessageLeadId] = useState('');
  const [selectedTeamUser, setSelectedTeamUser] = useState(null);
  const [conversationNumber, setConversationNumber] = useState('');
  const [conversationLeadId, setConversationLeadId] = useState('');
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'night');
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadTeamMessages, setUnreadTeamMessages] = useState(0);
  const [dueFollowUps, setDueFollowUps] = useState(0);
  const [showDialerModal, setShowDialerModal] = useState(false);   // â† New state
  const [currentUser, setCurrentUser] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileAdminSubTab, setMobileAdminSubTab] = useState('users');
  const activeTabRef = useRef(activeTab);
  const currentUserRef = useRef(currentUser);
  const selectedTeamUserRef = useRef(selectedTeamUser);
  const conversationNumberRef = useRef(conversationNumber);
  const showDialerModalRef = useRef(showDialerModal);
  const mobileMenuOpenRef = useRef(mobileMenuOpen);
  const mobileAdminSubTabRef = useRef(mobileAdminSubTab);
  const tabHistoryRef = useRef([]);
  const isAdmin = currentUser?.role === 'admin';

  const pushAppHistoryState = useCallback(() => {
    if (typeof window === 'undefined' || !token) return;
    window.history.pushState({ dialioNav: true, ts: Date.now() }, '', window.location.href);
  }, [token]);

  const openTab = useCallback((tabId, options = {}) => {
    const { fromBack = false, keepConversation = false } = options;
    const currentTab = activeTabRef.current;

    if (!fromBack && (currentTab !== tabId || conversationNumberRef.current || selectedTeamUserRef.current)) {
      if (currentTab && currentTab !== tabId) {
        tabHistoryRef.current = [...tabHistoryRef.current.slice(-19), currentTab];
      }
      pushAppHistoryState();
    }

    setActiveTab(tabId);
    setMobileMenuOpen(false);
    if (tabId !== 'team') {
      setSelectedTeamUser(null);
    }
    if (!keepConversation) {
      setConversationNumber('');
      setConversationLeadId('');
    }
    if (tabId === 'messages') {
      setUnreadMessages(0);
    }
    if (tabId === 'team') {
      setUnreadTeamMessages(0);
      window.dispatchEvent(new Event('refreshInternalMessages'));
    }
    if (tabId === 'followups') {
      dismissFollowUpReminderToast();
    }
  }, [pushAppHistoryState]);

  // Click-to-Call from Contacts
  useEffect(() => {
    const handleCallContact = (event) => {
      const { phoneNumber } = event.detail;
      pushAppHistoryState();
      setSelectedPhoneNumber(phoneNumber);
      setShowDialerModal(true);
      window.dispatchEvent(new Event('restoreDialer'));
    };
    window.addEventListener('callContact', handleCallContact);
    return () => window.removeEventListener('callContact', handleCallContact);
  }, [pushAppHistoryState]);

  useEffect(() => {
    const handlePasteNumberOnDialer = (event) => {
      const { phoneNumber } = event.detail || {};
      if (!phoneNumber) return;

      pushAppHistoryState();
      setSelectedPhoneNumber(phoneNumber);
      setShowDialerModal(true);
      window.dispatchEvent(new Event('restoreDialer'));
    };

    window.addEventListener('pasteNumberOnDialer', handlePasteNumberOnDialer);
    return () => window.removeEventListener('pasteNumberOnDialer', handlePasteNumberOnDialer);
  }, [pushAppHistoryState]);

  useEffect(() => {
    const handleMessageContact = (event) => {
      const { phoneNumber, leadId } = event.detail;
      setSelectedMessageNumber(phoneNumber);
      setSelectedMessageLeadId(leadId || '');
      openTab('messages');
    };

    window.addEventListener('messageContact', handleMessageContact);
    return () => window.removeEventListener('messageContact', handleMessageContact);
  }, [openTab]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    selectedTeamUserRef.current = selectedTeamUser;
  }, [selectedTeamUser]);

  useEffect(() => {
    conversationNumberRef.current = conversationNumber;
  }, [conversationNumber]);

  useEffect(() => {
    showDialerModalRef.current = showDialerModal;
  }, [showDialerModal]);

  useEffect(() => {
    mobileMenuOpenRef.current = mobileMenuOpen;
  }, [mobileMenuOpen]);

  useEffect(() => {
    mobileAdminSubTabRef.current = mobileAdminSubTab;
  }, [mobileAdminSubTab]);

  // Keep mobile/browser Back button inside the app and step back through active views/tabs
  useEffect(() => {
    if (!token || typeof window === 'undefined') return undefined;

    if (!window.history.state?.dialioBase && !window.history.state?.dialioGuard && !window.history.state?.dialioNav) {
      window.history.replaceState({ dialioBase: true }, '', window.location.href);
      window.history.pushState({ dialioGuard: true }, '', window.location.href);
    } else if (window.history.state?.dialioBase) {
      window.history.pushState({ dialioGuard: true }, '', window.location.href);
    }

    let userActivatedGuard = false;
    const ensureUserActivatedGuard = () => {
      if (userActivatedGuard) return;
      userActivatedGuard = true;
      if (window.history.state?.dialioGuard) {
        window.history.replaceState({ dialioGuard: true, activated: true }, '', window.location.href);
      } else if (window.history.state?.dialioBase) {
        window.history.pushState({ dialioGuard: true, activated: true }, '', window.location.href);
      }
    };

    const handlePopState = () => {
      const ensureGuardPresent = () => {
        if (!window.history.state?.dialioNav && !window.history.state?.dialioGuard) {
          window.history.pushState({ dialioGuard: true }, '', window.location.href);
        }
      };

      const childBackEvent = new CustomEvent('dialioBackNavigation', { cancelable: true });
      window.dispatchEvent(childBackEvent);
      if (childBackEvent.defaultPrevented) {
        ensureGuardPresent();
        return;
      }

      if (showDialerModalRef.current) {
        setShowDialerModal(false);
        ensureGuardPresent();
        return;
      }

      if (mobileMenuOpenRef.current) {
        setMobileMenuOpen(false);
        ensureGuardPresent();
        return;
      }

      if (conversationNumberRef.current) {
        setConversationNumber('');
        setConversationLeadId('');
        ensureGuardPresent();
        return;
      }

      if (activeTabRef.current === 'team' && selectedTeamUserRef.current) {
        setSelectedTeamUser(null);
        ensureGuardPresent();
        return;
      }

      if (activeTabRef.current === 'admin' && mobileAdminSubTabRef.current !== 'users') {
        setMobileAdminSubTab('users');
        ensureGuardPresent();
        return;
      }

      while (tabHistoryRef.current.length > 0) {
        const previousTab = tabHistoryRef.current[tabHistoryRef.current.length - 1];
        tabHistoryRef.current = tabHistoryRef.current.slice(0, -1);
        if (previousTab && previousTab !== activeTabRef.current) {
          openTab(previousTab, { fromBack: true });
          ensureGuardPresent();
          return;
        }
      }

      if (activeTabRef.current !== 'history') {
        openTab('history', { fromBack: true });
        ensureGuardPresent();
        return;
      }

      ensureGuardPresent();
    };

    window.addEventListener('pointerdown', ensureUserActivatedGuard, { passive: true });
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('pointerdown', ensureUserActivatedGuard);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [openTab, token]);

  useEffect(() => {
    const userId = getUserId(currentUser);
    if (!userId) {
      setUnreadMessages(0);
      return;
    }

    setUnreadMessages(Number(localStorage.getItem(getUnreadMessagesKey(userId))) || 0);
  }, [currentUser]);

  useEffect(() => {
    const userId = getUserId(currentUser);
    if (!userId) return;

    localStorage.setItem(getUnreadMessagesKey(userId), String(unreadMessages));
  }, [currentUser, unreadMessages]);

  const refreshUnreadTeamMessages = useCallback(async () => {
    if (!token) return;

    try {
      const res = await fetch(`${BACKEND_URL}/api/internal-messages/unread-count`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await readJsonResponse(res);

      if (res.ok) {
        setUnreadTeamMessages(Number(data.count) || 0);
      }
    } catch (error) {
      console.error('Failed to refresh team message count:', error);
    }
  }, [token]);

  const refreshDueFollowUps = useCallback(async () => {
    if (!token) return;

    try {
      const res = await fetch(`${BACKEND_URL}/api/followups?mineOnly=true`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await readJsonResponse(res);

      if (!res.ok || !Array.isArray(data)) return;

      const dueItems = data.filter((item) => (
        !item.completed && new Date(item.followUpDate) <= new Date()
      ));

      setDueFollowUps(dueItems.length);

      if (dueItems.length > 0) {
        startFollowUpReminderAlarm();

        if (activeTabRef.current !== 'followups') {
          const firstDue = dueItems[0];
          showFollowUpReminderToast({
            name: firstDue.name,
            note: firstDue.note,
            dueCount: dueItems.length,
            onClick: () => openTab('followups')
          });
        } else {
          dismissFollowUpReminderToast();
        }
      } else {
        stopFollowUpReminderAlarm();
        dismissFollowUpReminderToast();
      }
    } catch (error) {
      console.error('Failed to refresh follow-up reminders:', error);
    }
  }, [openTab, token]);

  useEffect(() => {
    if (!token) return undefined;

    const initialRefresh = window.setTimeout(refreshDueFollowUps, 0);
    const interval = window.setInterval(refreshDueFollowUps, 5000);
    window.addEventListener('refreshFollowUps', refreshDueFollowUps);

    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
      window.removeEventListener('refreshFollowUps', refreshDueFollowUps);
      stopFollowUpReminderAlarm();
      dismissFollowUpReminderToast();
    };
  }, [refreshDueFollowUps, token]);

  useEffect(() => {
    if (!token) return undefined;

    const fetchCurrentUser = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        const data = await res.json();

        if (res.ok) {
          setCurrentUser(data);
        }
      } catch (error) {
        console.error('Failed to load current user:', error);
      }
    };

    fetchCurrentUser();
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;

    const unreadRefreshTimer = window.setTimeout(refreshUnreadTeamMessages, 0);

    const socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      auth: { token }
    });

    const currentUserId = getUserId(currentUserRef.current);
    if (currentUserId) {
      socket.emit('join-user-room', { userId: currentUserId });
    }

    socket.on('incoming-message', (message) => {
      const assignedRecipients = Array.isArray(message.assignedTo)
        ? message.assignedTo.map((value) => String(value))
        : [String(message.assignedTo || '')].filter(Boolean);
      const currentUserId = getUserId(currentUserRef.current);

      if (!assignedRecipients.includes(currentUserId)) return;

      const threadKey = normalizePhone(message.from) || message.from;
      if (threadKey && activeTabRef.current !== 'messages') {
        const unreadKey = getUnreadSmsThreadsKey(currentUserId);
        const unreadThreads = JSON.parse(localStorage.getItem(unreadKey) || '[]');
        localStorage.setItem(unreadKey, JSON.stringify([...new Set([...unreadThreads, threadKey])]));
      }

      window.dispatchEvent(new CustomEvent('refreshMessages', {
        detail: { message }
      }));

      if (activeTabRef.current !== 'messages') {
        setUnreadMessages((count) => count + 1);
      }

      showIncomingSmsToast({
        from: formatPhoneNumber(message.from) || message.from,
        body: message.body,
        onClick: () => {
          setSelectedMessageNumber(message.from);
          setSelectedMessageLeadId(message.lead || '');
          setConversationNumber(message.from);
          setConversationLeadId(message.lead || '');
          openTab('messages', { keepConversation: true });
        }
      });
    });

    socket.on('call-transcription-updated', () => {
      window.dispatchEvent(new Event('refreshCallHistory'));
    });

    socket.on('refresh-call-history', () => {
      window.dispatchEvent(new Event('refreshCallHistory'));
    });

    socket.on('call-answered-by-teammate', (payload) => {
      window.dispatchEvent(new CustomEvent('callAnsweredByTeammate', {
        detail: payload
      }));
      window.dispatchEvent(new Event('refreshCallHistory'));
    });

    socket.on('message-status-updated', () => {
      window.dispatchEvent(new Event('refreshMessages'));
    });

    socket.on('ai-message-sent', () => {
      window.dispatchEvent(new Event('refreshMessages'));
    });

    socket.on('lead-assigned', (payload) => {
      const assignedUserId = getUserId(currentUserRef.current);
      const leadAssignedToUser = payload?.lead?.assignedTo && getUserId(payload.lead.assignedTo) === assignedUserId;

      if (!leadAssignedToUser) return;

      window.dispatchEvent(new Event('refreshLeads'));
      showSuccessToast(payload.message || 'You were assigned a new lead');
    });

    socket.on('internal-message-created', (message) => {
      window.dispatchEvent(new CustomEvent('refreshInternalMessages', {
        detail: message
      }));
      const user = currentUserRef.current;
      const currentUserId = getUserId(user);
      const senderId = getUserId(message.sender);
      const recipientId = getUserId(message.recipient);

      if (recipientId === currentUserId) {
        refreshUnreadTeamMessages();

        const selectedTeamUserId = getUserId(selectedTeamUserRef.current);
        const isOpenConversation = activeTabRef.current === 'team' && selectedTeamUserId === senderId;

        if (!isOpenConversation) {
          showTeamMessageToast({
            senderName: message.sender?.name,
            onClick: () => {
              openTab('team');
              pushAppHistoryState();
              setSelectedTeamUser(message.sender);
            }
          });
        }
      }
    });

    return () => {
      window.clearTimeout(unreadRefreshTimer);
      socket.disconnect();
    };
  }, [openTab, pushAppHistoryState, refreshUnreadTeamMessages, token]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const handleOpenConversation = (event) => {
      const { phoneNumber, leadId } = event.detail;
      if (phoneNumber && phoneNumber !== conversationNumberRef.current) {
        pushAppHistoryState();
      }
      setConversationNumber(phoneNumber);
      setConversationLeadId(leadId || '');
    };

    window.addEventListener('openConversation', handleOpenConversation);
    return () => window.removeEventListener('openConversation', handleOpenConversation);
  }, [pushAppHistoryState]);

  const clearSelectedMessageNumber = useCallback(() => {
    setSelectedMessageNumber('');
    setSelectedMessageLeadId('');
  }, []);

  const openNewCall = () => {
    if (!showDialerModalRef.current) {
      pushAppHistoryState();
    }
    setSelectedPhoneNumber('');
    setShowDialerModal(true);
    window.dispatchEvent(new Event('restoreDialer'));
  };

  const handleLogout = async () => {
    const currentToken = localStorage.getItem('token');

    if (currentToken) {
      try {
        await fetch(`${BACKEND_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${currentToken}`
          }
        });
      } catch (error) {
        console.error('Failed to record logout:', error);
      }
    }

    localStorage.removeItem('token');
    setToken(null);
    setSelectedPhoneNumber('');
    setSelectedMessageNumber('');
    setSelectedMessageLeadId('');
    setSelectedTeamUser(null);
    setConversationNumber('');
    setConversationLeadId('');
    setUnreadMessages(0);
    setUnreadTeamMessages(0);
    setDueFollowUps(0);
    stopFollowUpReminderAlarm();
    dismissFollowUpReminderToast();
    setCurrentUser(null);
  };

  const confirmLogout = () => {
    confirmAction({
      title: 'Logout?',
      text: 'Are you sure you want to logout?',
      confirmButtonText: 'Logout',
      icon: 'warning',
      confirmButtonColor: '#DC2626',
      onConfirm: handleLogout
    });
  };

  const toggleTheme = () => {
    setTheme((current) => current === 'night' ? 'day' : 'night');
  };

  if (!token) {
    return (
      <>
        <Login />
        <AppToaster />
      </>
    );
  }

  const navItems = [
    ...(isAdmin ? [{ id: 'admin', label: 'Admin' }] : []),
    { id: 'history', label: 'Calls' },
    { id: 'contacts', label: 'Contacts' },
    { id: 'messages', label: 'Messages' },
    { id: 'team', label: 'Team Chat' },
    { id: 'followups', label: 'Follow Ups' },
    { id: 'parts', label: 'Parts' },
    { id: 'settings', label: 'Settings' },
  ];

  const totalAlerts = (unreadMessages || 0) + (unreadTeamMessages || 0) + (dueFollowUps || 0);

  const isMobileDetailActive = Boolean(
    (activeTab === 'team' && selectedTeamUser) ||
    ((activeTab === 'messages' || activeTab === 'history' || activeTab === 'contacts') && conversationNumber)
  );

  return (
    <div className="app-shell flex h-screen flex-col bg-[#0A0C14] text-white overflow-hidden md:flex-row">
      {/* Mobile Top Navigation Bar */}
      <div className="md:hidden flex items-center justify-between px-3.5 py-2.5 bg-[#11151F] border-b border-gray-800 safe-top shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => {
              pushAppHistoryState();
              setMobileMenuOpen(true);
            }}
            className="relative p-2 rounded-xl text-gray-300 hover:text-white hover:bg-gray-800 transition shrink-0"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
            {totalAlerts > 0 && (
              <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-[#11151F]" />
            )}
          </button>
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 bg-gradient-to-br from-[#059669] via-emerald-500 to-teal-500 rounded-lg flex items-center justify-center text-white shadow-md">
              <NavIcon type="history" />
            </div>
            <span className="font-bold tracking-tight text-lg text-white">Dialio</span>
          </div>
          <span className="rounded-lg bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-300 truncate max-w-[110px]">
            {activeTab === 'crm' ? 'CRM' : activeTab === 'team' ? 'Team Chat' : navItems.find((n) => n.id === activeTab)?.label || activeTab}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={openNewCall}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition"
            title="New Call"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Call</span>
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-xl text-gray-300 hover:text-white hover:bg-gray-800 transition"
            title={theme === 'night' ? 'Switch to day mode' : 'Switch to night mode'}
          >
            <span className="block w-4 h-4"><NavIcon type={theme === 'night' ? 'sun' : 'moon'} /></span>
          </button>
        </div>
      </div>

      {/* Mobile Slide-Over Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          <div className="relative w-72 max-w-[82vw] bg-[#11151F] border-r border-gray-800 flex flex-col h-full z-10 shadow-2xl safe-top safe-bottom">
            <div className="px-4 py-4 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 bg-gradient-to-br from-[#059669] via-emerald-500 to-teal-500 rounded-xl flex items-center justify-center text-white shadow-lg shrink-0">
                  <NavIcon type="history" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold tracking-tight text-white">Dialio</h2>
                  <p className="text-[11px] text-gray-400 truncate max-w-[150px]">{currentUser?.name || currentUser?.email || 'Logged in'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto thin-scrollbar p-3 space-y-1">
              {navItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => openTab(item.id)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl cursor-pointer text-sm font-medium transition ${
                    activeTab === item.id ? 'bg-gray-800 text-white font-semibold' : 'text-gray-300 hover:bg-gray-800/60'
                  }`}
                >
                  <span className="w-5 text-current"><NavIcon type={item.id} /></span>
                  <span>{item.label}</span>
                  {item.id === 'messages' && unreadMessages > 0 && (
                    <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                      {unreadMessages > 99 ? '99+' : unreadMessages}
                    </span>
                  )}
                  {item.id === 'team' && unreadTeamMessages > 0 && (
                    <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                      {unreadTeamMessages > 99 ? '99+' : unreadTeamMessages}
                    </span>
                  )}
                  {item.id === 'followups' && dueFollowUps > 0 && (
                    <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                      {dueFollowUps > 99 ? '99+' : dueFollowUps}
                    </span>
                  )}
                </div>
              ))}

              <div
                onClick={() => openTab('crm')}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white shadow-md transition cursor-pointer mt-2 ${
                  activeTab === 'crm' ? 'bg-cyan-500 ring-2 ring-cyan-200/50' : 'bg-cyan-600 hover:bg-cyan-500'
                }`}
              >
                <span className="w-5"><NavIcon type="crm" /></span>
                CRM
              </div>

              <div
                onClick={() => {
                  setMobileMenuOpen(false);
                  openNewCall();
                }}
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl cursor-pointer text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-md mt-2"
              >
                <span className="w-5"><NavIcon type="plus" /></span>
                New Call
              </div>

              <div id="dialer-sidebar-status-mobile" className="pt-2" />
            </nav>

            <div className="p-3 border-t border-gray-800 space-y-1">
              <button
                type="button"
                onClick={toggleTheme}
                className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-800"
              >
                <span className="w-5"><NavIcon type={theme === 'night' ? 'sun' : 'moon'} /></span>
                {theme === 'night' ? 'Day Mode' : 'Night Mode'}
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  confirmLogout();
                }}
                className="flex w-full items-center gap-3 px-3.5 py-2 text-sm text-red-400 hover:bg-red-950/30 rounded-xl transition font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <div className="hidden md:flex md:w-60 md:shrink-0 md:flex-col md:border-r border-gray-800 bg-[#11151F]">
        <div className="px-5 py-4 flex items-center gap-3 border-b border-gray-800">
          <div className="w-9 h-9 bg-gradient-to-br from-[#059669] via-emerald-500 to-teal-500 rounded-xl flex items-center justify-center text-white shadow-lg">
            <NavIcon type="history" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Dialio</h1>
        </div>

        <nav className="flex-1 overflow-y-auto thin-scrollbar p-3 space-y-1">
          {navItems.map((item) => (
            <div
              key={item.id}
              onClick={() => openTab(item.id)}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl cursor-pointer text-sm font-medium transition-all
                ${activeTab === item.id ? 'bg-gray-800 text-white font-semibold' : 'hover:bg-gray-800 text-gray-300'}`}
            >
              <span className="w-5 text-current"><NavIcon type={item.id} /></span>
              <span>{item.label}</span>
              {item.id === 'messages' && unreadMessages > 0 && (
                <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                  {unreadMessages > 99 ? '99+' : unreadMessages}
                </span>
              )}
              {item.id === 'team' && unreadTeamMessages > 0 && (
                <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                  {unreadTeamMessages > 99 ? '99+' : unreadTeamMessages}
                </span>
              )}
              {item.id === 'followups' && dueFollowUps > 0 && (
                <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                  {dueFollowUps > 99 ? '99+' : dueFollowUps}
                </span>
              )}
            </div>
          ))}

          <div
            onClick={() => openTab('crm')}
            className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg transition-all mt-auto
              ${activeTab === 'crm'
                ? 'cursor-default bg-cyan-500 ring-2 ring-cyan-200/50'
                : 'cursor-pointer bg-cyan-600 hover:bg-cyan-500'}`}
          >
            <span className="w-5"><NavIcon type="crm" /></span>
            CRM
          </div>

          <div
            onClick={openNewCall}
            className="flex items-center gap-2 px-4 py-3 rounded-xl cursor-pointer text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-lg mt-4"
          >
            <span className="w-5"><NavIcon type="plus" /></span>
            New Call
          </div>

          <div id="dialer-sidebar-status" className="w-full shrink-0" />
        </nav>

        <div className="p-3 border-t border-gray-800">
          <button
            type="button"
            onClick={toggleTheme}
            className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium text-gray-300 transition hover:bg-gray-800"
            title={theme === 'night' ? 'Switch to day mode' : 'Switch to night mode'}
          >
            <span className="w-5"><NavIcon type={theme === 'night' ? 'sun' : 'moon'} /></span>
            {theme === 'night' ? 'Day' : 'Night'}
          </button>
          <button 
            onClick={confirmLogout}
            className="w-full py-2.5 text-sm text-red-400 hover:bg-red-950/30 rounded-xl transition font-medium"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Middle Panel / Primary Content View */}
      <div className={`min-h-0 flex-1 border-r border-gray-800 bg-[#161B28] flex flex-col ${
        activeTab === 'crm' || activeTab === 'parts'
          ? 'w-full lg:hidden'
          : 'w-full lg:w-[390px] xl:w-[410px] lg:flex-none'
      }`}>
        {/* Header - Hidden on mobile if viewing mobile conversation/chat detail because detail view provides its own full header with back button */}
        <div className={`${isMobileDetailActive ? 'hidden lg:flex' : 'flex'} h-12 border-b border-gray-800 items-center justify-between px-4 bg-[#1C2333] md:h-14 md:px-5 shrink-0`}>
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-base font-semibold md:text-lg truncate">
              {activeTab === 'admin' && 'Admin Dashboard'}
              {activeTab === 'history' && 'Call History'}
              {activeTab === 'contacts' && 'Contacts'}
              {activeTab === 'messages' && 'Messages'}
              {activeTab === 'crm' && 'CRM'}
              {activeTab === 'team' && 'Team Chat'}
              {activeTab === 'followups' && 'Follow Ups'}
              {activeTab === 'parts' && 'Parts'}
              {activeTab === 'settings' && 'Settings'}
            </h2>
          </div>

          {activeTab === 'admin' && isAdmin && (
            <div className="lg:hidden flex items-center gap-1 rounded-lg bg-gray-800 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setMobileAdminSubTab('users')}
                className={`px-2 py-1 rounded-md font-medium transition ${
                  mobileAdminSubTab === 'users' ? 'bg-[#059669] text-white shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
              >
                Users
              </button>
              <button
                type="button"
                onClick={() => {
                  if (mobileAdminSubTab !== 'stats') {
                    pushAppHistoryState();
                  }
                  setMobileAdminSubTab('stats');
                }}
                className={`px-2 py-1 rounded-md font-medium transition ${
                  mobileAdminSubTab === 'stats' ? 'bg-[#059669] text-white shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
              >
                Stats & Add
              </button>
            </div>
          )}

          <div className="flex items-center gap-1.5 md:hidden">
            <button
              onClick={confirmLogout}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-red-300 hover:bg-red-950/30"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className={`flex-1 overflow-auto thin-scrollbar ${isMobileDetailActive ? 'p-0 lg:p-2 xl:p-3' : 'p-2 md:p-3'}`}>
          {activeTab === 'admin' && isAdmin && (
            <>
              <div className="lg:hidden h-full">
                {mobileAdminSubTab === 'users' ? (
                  <AdminDashboard showStats={false} showCreateUser={false} showUsers={true} />
                ) : (
                  <AdminDashboard showUsers={false} showStats={true} showCreateUser={true} />
                )}
              </div>
              <div className="hidden lg:block h-full">
                <AdminDashboard showStats={false} showCreateUser={false} showUsers={true} />
              </div>
            </>
          )}

          {activeTab === 'history' && (
            <>
              {conversationNumber && (
                <div className="lg:hidden h-full">
                  <ConversationDetails
                    phoneNumber={conversationNumber}
                    leadId={conversationLeadId}
                    onClose={() => {
                      setConversationNumber('');
                      setConversationLeadId('');
                    }}
                  />
                </div>
              )}
              <div className={conversationNumber ? 'hidden lg:block h-full' : 'h-full'}>
                <CallHistory />
              </div>
            </>
          )}

          {activeTab === 'contacts' && (
            <>
              {conversationNumber && (
                <div className="lg:hidden h-full">
                  <ConversationDetails
                    phoneNumber={conversationNumber}
                    leadId={conversationLeadId}
                    onClose={() => {
                      setConversationNumber('');
                      setConversationLeadId('');
                    }}
                  />
                </div>
              )}
              <div className={conversationNumber ? 'hidden lg:block h-full' : 'h-full'}>
                <Contacts />
              </div>
            </>
          )}

          {activeTab === 'messages' && (
            <>
              {conversationNumber && (
                <div className="lg:hidden h-full">
                  <ConversationDetails
                    phoneNumber={conversationNumber}
                    leadId={conversationLeadId}
                    onClose={() => {
                      setConversationNumber('');
                      setConversationLeadId('');
                    }}
                  />
                </div>
              )}
              <div className={conversationNumber ? 'hidden lg:block h-full' : 'h-full'}>
                <Messages
                  selectedPhoneNumber={selectedMessageNumber}
                  selectedLeadId={selectedMessageLeadId}
                  onRecipientUsed={clearSelectedMessageNumber}
                  currentUser={currentUser}
                />
              </div>
            </>
          )}

          {activeTab === 'team' && (
            <>
              {selectedTeamUser && (
                <div className="lg:hidden h-full">
                  <InternalMessageDetails
                    currentUser={currentUser}
                    selectedUser={selectedTeamUser}
                    onReadMessages={refreshUnreadTeamMessages}
                    onBack={() => setSelectedTeamUser(null)}
                  />
                </div>
              )}
              <div className={selectedTeamUser ? 'hidden lg:block h-full' : 'h-full'}>
                <InternalMessages
                  currentUser={currentUser}
                  selectedUserId={getUserId(selectedTeamUser)}
                  onSelectUser={(user) => {
                    if (user && getUserId(user) !== getUserId(selectedTeamUserRef.current)) {
                      pushAppHistoryState();
                    }
                    setSelectedTeamUser(user);
                  }}
                  onReadMessages={refreshUnreadTeamMessages}
                />
              </div>
            </>
          )}

          {activeTab === 'crm' && <CRM />}
          {activeTab === 'followups' && (
            <FollowUps onDueCountChange={setDueFollowUps} currentUser={currentUser} />
          )}
          {activeTab === 'parts' && <Parts currentUser={currentUser} />}
          {activeTab === 'settings' && <Settings />}
        </div>
      </div>

      {/* Right Persistent Area (Desktop lg+ only) */}
      <div className="hidden min-w-0 flex-1 flex-col border-l border-gray-800 bg-[#0F1322] lg:flex">
        {activeTab === 'admin' && isAdmin ? (
          <div className="h-full overflow-auto p-4 thin-scrollbar">
            <AdminDashboard showUsers={false} />
          </div>
        ) : activeTab === 'crm' ? (
          <div className="h-full overflow-auto p-4 thin-scrollbar">
            <CRM />
          </div>
        ) : activeTab === 'parts' ? (
          <div className="h-full overflow-auto p-4 thin-scrollbar">
            <Parts currentUser={currentUser} />
          </div>
        ) : activeTab === 'team' ? (
          <InternalMessageDetails
            currentUser={currentUser}
            selectedUser={selectedTeamUser}
            onReadMessages={refreshUnreadTeamMessages}
          />
        ) : (
          <ConversationDetails
            phoneNumber={conversationNumber}
            leadId={conversationLeadId}
            onClose={() => {
              setConversationNumber('');
              setConversationLeadId('');
            }}
          />
        )}
      </div>

      <Dialer
        selectedPhoneNumber={selectedPhoneNumber}
        isOpen={showDialerModal}
        onClose={() => setShowDialerModal(false)}
        currentUser={currentUser}
      />

      <AppToaster />
    </div>
  );
}

export default App;
