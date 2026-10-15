import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Device } from '@twilio/voice-sdk';
import {
  Phone,
  PhoneCall,
  PhoneOff,
  PhoneIncoming,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Pause,
  Play,
  Minus,
  X,
  Maximize2,
  GripHorizontal,
  RotateCcw,
  Delete,
  Hash
} from 'lucide-react';
import { BACKEND_URL } from '../config/api.js';

const DEVICE_STATES = {
  INITIALIZING: 'initializing',
  REGISTERING: 'registering',
  REFRESHING: 'refreshing',
  READY: 'ready',
  OFFLINE: 'offline',
  ERROR: 'error',
};

const fetchTwilioToken = async () => {
  const authToken = localStorage.getItem('token');
  if (!authToken) {
    throw new Error('Not signed in');
  }

  const res = await fetch(`${BACKEND_URL}/api/twilio/token`, {
    headers: { Authorization: `Bearer ${authToken}` }
  });
  const data = await res.json();

  if (!res.ok || !data.token) {
    throw new Error(data.message || 'Unable to get Twilio token');
  }

  return data.token;
};

const DIALER_ANIMATION_MS = 220;
const INCOMING_ALERT_TITLE = 'Incoming call';
const INCOMING_ALERT_BODY = 'Open Dialio to answer or reject.';

const canUseNotifications = () => (
  typeof window !== 'undefined'
  && window.isSecureContext
  && 'Notification' in window
);

const getIncomingCallerNumber = (conn) => {
  const customFrom = conn?.customParameters?.get?.('originalFrom');
  return customFrom || conn?.parameters?.originalFrom || conn?.parameters?.From || 'Unknown Number';
};

const getIncomingAllottedNumber = (conn) => {
  const customTo = conn?.customParameters?.get?.('originalTo');
  return customTo || conn?.parameters?.originalTo || conn?.parameters?.To || '';
};

const getParentCallSid = (conn) => {
  const customSid = conn?.customParameters?.get?.('parentCallSid');
  return customSid || conn?.parameters?.parentCallSid || conn?.parameters?.CallSid || '';
};

const getIncomingCallContext = (conn) => {
  const getParam = (name) => conn?.customParameters?.get?.(name) || conn?.parameters?.[name] || '';

  return {
    lastHandledBy: getParam('lastHandledBy'),
    lastHandledByName: getParam('lastHandledByName'),
    lastHandledAt: getParam('lastHandledAt'),
    lastCallType: getParam('lastCallType'),
    lastCallStatus: getParam('lastCallStatus')
  };
};

const getUserId = (user) => String(user?.id || user?._id || '');

const formatLastHandledAt = (value) => {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const formatDuration = (sec) => {
  const mins = Math.floor(sec / 60);
  const secs = sec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const getDialableClipboardValue = (value) => String(value || '')
  .replace(/[^\d+*#]/g, '')
  .replace(/(?!^)\+/g, '');

function Dialer({ selectedPhoneNumber = '', isOpen = true, onClose, currentUser = null }) {
  const [phoneNumber, setPhoneNumber] = useState(selectedPhoneNumber);
  const [device, setDevice] = useState(null);
  const [connection, setConnection] = useState(null);
  const [callStatus, setCallStatus] = useState('Ready');
  const [deviceState, setDeviceState] = useState(DEVICE_STATES.INITIALIZING);
  const [deviceError, setDeviceError] = useState('');
  const [isCalling, setIsCalling] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [showKeypad, setShowKeypad] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isIncomingMinimized, setIsIncomingMinimized] = useState(false);
  const [shouldRenderDialer, setShouldRenderDialer] = useState(isOpen);
  const [dialerMotion, setDialerMotion] = useState(isOpen ? 'open' : 'closed');
  const [position, setPosition] = useState(null);

  const [sidebarStatusTarget, setSidebarStatusTarget] = useState(() =>
    typeof document !== 'undefined' ? document.getElementById('dialer-sidebar-status') : null
  );

  useEffect(() => {
    if (!sidebarStatusTarget && typeof document !== 'undefined') {
      const target = document.getElementById('dialer-sidebar-status');
      if (target) {
        setSidebarStatusTarget(target);
      }
    }
  }, [sidebarStatusTarget]);

  const targetStatusNode = sidebarStatusTarget || (typeof document !== 'undefined' ? document.getElementById('dialer-sidebar-status') : null);

  const startTimeRef = useRef(null);
  const timerRef = useRef(null);
  const activeCallRef = useRef(null);
  const currentUserRef = useRef(currentUser);
  const resolveInboundCallEndRef = useRef(async () => {});
  const dialerAnimationRef = useRef(null);
  const incomingNotificationRef = useRef(null);
  const titleAlertRef = useRef(null);
  const originalTitleRef = useRef(typeof document !== 'undefined' ? document.title : '');
  const ringtoneAudioRef = useRef(null);
  const deviceRef = useRef(null);
  const tokenRefreshRef = useRef(null);
  const retryDeviceRegistrationRef = useRef(async () => {});
  const resetCallRef = useRef(() => {});
  const panelRef = useRef(null);
  const dragDataRef = useRef({ isDragging: false, startX: 0, startY: 0, originX: 0, originY: 0 });

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startTimer = (startTime = Date.now()) => {
    stopTimer();
    startTimeRef.current = startTime;
    setDuration(Math.max(0, Math.floor((Date.now() - startTime) / 1000)));
    timerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);
  };

  const shouldShowFullDialer = (isOpen || isCalling) && !isMinimized;
  const shouldShowMinimized = (isOpen || isCalling) && isMinimized;
  const isDeviceReady = deviceState === DEVICE_STATES.READY;

  const retryDeviceRegistration = () =>
    retryDeviceRegistrationRef.current();

  const formatIncomingAlertText = (from) => from || 'Unknown Number';

  const stopIncomingAlerts = () => {
    incomingNotificationRef.current?.close?.();
    incomingNotificationRef.current = null;

    if (titleAlertRef.current) {
      window.clearInterval(titleAlertRef.current);
      titleAlertRef.current = null;
      document.title = originalTitleRef.current;
    }

    if (ringtoneAudioRef.current) {
      ringtoneAudioRef.current.pause();
      try {
        ringtoneAudioRef.current.currentTime = 0;
      } catch {
        // Some browsers do not allow seeking a MediaStream-backed audio element.
      }
    }
  };

  const createRingtoneAudio = () => {
    if (ringtoneAudioRef.current) return ringtoneAudioRef.current;

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;

    const audioContext = new AudioContextCtor();
    const soundDuration = 1.8;
    const sampleRate = audioContext.sampleRate;
    const frameCount = sampleRate * soundDuration;
    const buffer = audioContext.createBuffer(1, frameCount, sampleRate);
    const channel = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i += 1) {
      const time = i / sampleRate;
      const isTone = (time % 0.9) < 0.55;
      const tone = Math.sin(2 * Math.PI * 440 * time) + Math.sin(2 * Math.PI * 554.37 * time);
      channel[i] = isTone ? tone * 0.18 : 0;
    }

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const destination = audioContext.createMediaStreamDestination();
    source.connect(destination);
    source.start();

    const audio = new Audio();
    audio.srcObject = destination.stream;
    audio.loop = true;
    ringtoneAudioRef.current = audio;
    return audio;
  };

  const playIncomingRingtone = async () => {
    try {
      const audio = createRingtoneAudio();
      if (!audio) return;

      await audio.play();
    } catch (err) {
      console.info('Incoming call ringtone was blocked by the browser:', err);
    }
  };

  const requestNotificationPermission = async () => {
    if (!canUseNotifications() || Notification.permission !== 'default') return;

    try {
      await Notification.requestPermission();
    } catch (err) {
      console.info('Notification permission request failed:', err);
    }
  };

  const startTitleAlert = (from) => {
    if (titleAlertRef.current) return;

    let showAlert = true;
    const alertTitle = `${INCOMING_ALERT_TITLE}: ${formatIncomingAlertText(from)}`;
    originalTitleRef.current = document.title;
    document.title = alertTitle;

    titleAlertRef.current = window.setInterval(() => {
      document.title = showAlert ? alertTitle : originalTitleRef.current;
      showAlert = !showAlert;
    }, 1000);
  };

  const showNativeIncomingNotification = async (from) => {
    if (!canUseNotifications()) return;

    if (Notification.permission === 'default') {
      await requestNotificationPermission();
    }

    if (Notification.permission !== 'granted') return;

    incomingNotificationRef.current?.close?.();
    incomingNotificationRef.current = new Notification(INCOMING_ALERT_TITLE, {
      body: `${formatIncomingAlertText(from)}\n${INCOMING_ALERT_BODY}`,
      tag: 'dialio-incoming-call',
      requireInteraction: true
    });

    incomingNotificationRef.current.onclick = () => {
      window.focus();
      setIsIncomingMinimized(false);
      incomingNotificationRef.current?.close?.();
    };
  };

  const startIncomingAlerts = (from) => {
    startTitleAlert(from);
    playIncomingRingtone();

    if (navigator.vibrate) {
      navigator.vibrate([300, 120, 300, 120, 300]);
    }

    if (document.hidden || !document.hasFocus()) {
      showNativeIncomingNotification(from);
    }
  };

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // Auto-fill from Contacts and auto-expand
  useEffect(() => {
    if (isOpen) {
      setPhoneNumber(selectedPhoneNumber || '');
      setIsMinimized(false);
    }
  }, [isOpen, selectedPhoneNumber]);

  useEffect(() => {
    if (selectedPhoneNumber) {
      setPhoneNumber(selectedPhoneNumber);
      setIsMinimized(false);
    }
  }, [selectedPhoneNumber]);

  // Listen to external triggers to unminimize
  useEffect(() => {
    const handleRestore = () => {
      setIsMinimized(false);
    };
    window.addEventListener('restoreDialer', handleRestore);
    window.addEventListener('callContact', handleRestore);
    window.addEventListener('pasteNumberOnDialer', handleRestore);
    return () => {
      window.removeEventListener('restoreDialer', handleRestore);
      window.removeEventListener('callContact', handleRestore);
      window.removeEventListener('pasteNumberOnDialer', handleRestore);
    };
  }, []);

  // Teammate answered listener
  useEffect(() => {
    const handleTeammateAnswered = (event) => {
      const {
        callSid,
        parentCallSid,
        answeredBy,
        answeredByName,
        assignedUserIds = []
      } = event.detail || {};
      const sessionCallSid = parentCallSid || callSid;
      const currentUserId = getUserId(currentUserRef.current);

      if (!sessionCallSid || !currentUserId) return;
      if (!assignedUserIds.map(String).includes(currentUserId)) return;
      if (String(answeredBy) === currentUserId) return;

      const currentCall = activeCallRef.current;
      if (!currentCall || currentCall.parentCallSid !== sessionCallSid || currentCall.accepted) return;

      activeCallRef.current = {
        ...currentCall,
        teammateAnswered: true,
        answeredBy,
        answeredByName,
        logged: true
      };

      stopIncomingAlerts();
      setIncomingCall(null);
      setIsIncomingMinimized(false);
      setConnection(null);
      resetCallRef.current();
    };

    window.addEventListener('callAnsweredByTeammate', handleTeammateAnswered);
    return () => window.removeEventListener('callAnsweredByTeammate', handleTeammateAnswered);
  }, []);

  useEffect(() => {
    const unlockAlerts = () => {
      requestNotificationPermission();
      createRingtoneAudio();
    };

    window.addEventListener('pointerdown', unlockAlerts, { once: true });
    window.addEventListener('keydown', unlockAlerts, { once: true });

    return () => {
      window.removeEventListener('pointerdown', unlockAlerts);
      window.removeEventListener('keydown', unlockAlerts);
      stopIncomingAlerts();
    };
  }, []);

  // Safe Paste (does NOT hijack paste when typing inside input/textarea)
  useEffect(() => {
    const handlePaste = (event) => {
      const target = event.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (!isOpen || isCalling || incomingCall) return;

      const pastedNumber = getDialableClipboardValue(event.clipboardData?.getData('text'));
      if (!pastedNumber) return;

      event.preventDefault();
      setPhoneNumber(pastedNumber);
      setIsMinimized(false);
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [incomingCall, isCalling, isOpen]);

  // Safe Keydown (does NOT hijack keystrokes when typing inside input/textarea)
  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (!isOpen || isCalling || incomingCall) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (/^\d$/.test(event.key) || event.key === '*' || event.key === '#') {
        event.preventDefault();
        setPhoneNumber((current) => current + event.key);
        setIsMinimized(false);
        return;
      }

      if (event.key === 'Backspace') {
        event.preventDefault();
        setPhoneNumber((current) => current.slice(0, -1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [incomingCall, isCalling, isOpen]);

  // Animate panel show / hide
  useEffect(() => {
    clearTimeout(dialerAnimationRef.current);

    if (shouldShowFullDialer) {
      setShouldRenderDialer(true);
      setDialerMotion('opening');
      const frame = requestAnimationFrame(() => setDialerMotion('open'));
      return () => {
        cancelAnimationFrame(frame);
        clearTimeout(dialerAnimationRef.current);
      };
    }

    if (shouldRenderDialer) {
      setDialerMotion('closing');
      dialerAnimationRef.current = setTimeout(() => {
        setShouldRenderDialer(false);
      }, DIALER_ANIMATION_MS);
    }

    return () => clearTimeout(dialerAnimationRef.current);
  }, [shouldShowFullDialer, shouldRenderDialer]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      stopTimer();
    };
  }, []);

  // Synchronize timer on tab visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && startTimeRef.current) {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Clamp dragged position on window resize
  useEffect(() => {
    const handleResize = () => {
      if (!position || !panelRef.current) return;
      const rect = panelRef.current.getBoundingClientRect();
      const maxX = Math.max(8, window.innerWidth - (rect.width || 340) - 8);
      const maxY = Math.max(8, window.innerHeight - (rect.height || 480) - 8);
      setPosition((prev) => {
        if (!prev) return null;
        return {
          x: Math.min(maxX, Math.max(8, prev.x)),
          y: Math.min(maxY, Math.max(8, prev.y))
        };
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [position]);

  // Initialize Twilio Device + Incoming Call Listener
  useEffect(() => {
    let twilioDevice;
    let disposed = false;

    const refreshDeviceToken = async (activeDevice, { silent = false } = {}) => {
      if (!activeDevice || tokenRefreshRef.current) return false;

      tokenRefreshRef.current = true;
      if (!silent) {
        setDeviceState(DEVICE_STATES.REFRESHING);
        setDeviceError('');
      }

      try {
        const token = await fetchTwilioToken();
        activeDevice.updateToken(token);
        return true;
      } catch (err) {
        console.error('Twilio token refresh failed:', err);
        setDeviceState(DEVICE_STATES.ERROR);
        setDeviceError(err.message || 'Unable to refresh phone connection');
        return false;
      } finally {
        tokenRefreshRef.current = false;
      }
    };

    const retryDeviceRegistration = async () => {
      const activeDevice = deviceRef.current;
      if (!activeDevice) return;

      setDeviceState(DEVICE_STATES.REGISTERING);
      setDeviceError('');

      try {
        const token = await fetchTwilioToken();
        activeDevice.updateToken(token);
        await activeDevice.register();
      } catch (err) {
        console.error('Twilio device retry failed:', err);
        setDeviceState(DEVICE_STATES.OFFLINE);
        setDeviceError(err.message || 'Unable to connect phone service');
      }
    };

    retryDeviceRegistrationRef.current = retryDeviceRegistration;

    const handleVisibilityChange = () => {
      if (disposed || document.visibilityState !== 'visible' || !twilioDevice) return;
      if (twilioDevice.state === Device.State.Registered) return;

      retryDeviceRegistration();
    };

    const initDevice = async () => {
      setDeviceState(DEVICE_STATES.INITIALIZING);
      setDeviceError('');

      try {
        const token = await fetchTwilioToken();
        if (disposed) return;

        twilioDevice = new Device(token, {
          edge: ['singapore', 'tokyo'],
          logLevel: 'warn',
        });
        deviceRef.current = twilioDevice;

        twilioDevice.on('registering', () => {
          setDeviceState(DEVICE_STATES.REGISTERING);
        });

        twilioDevice.on('registered', () => {
          setDeviceState(DEVICE_STATES.READY);
          setDeviceError('');
          setCallStatus('Ready');
        });

        twilioDevice.on('unregistered', () => {
          setDeviceState(DEVICE_STATES.OFFLINE);
          setDeviceError('Phone service disconnected');
        });

        twilioDevice.on('tokenWillExpire', () => {
          refreshDeviceToken(twilioDevice);
        });

        // Listen for Incoming Calls
        twilioDevice.on('incoming', (conn) => {
          const from = getIncomingCallerNumber(conn);
          const localNumber = getIncomingAllottedNumber(conn);
          const parentCallSid = getParentCallSid(conn);
          const callerContext = getIncomingCallContext(conn);
          console.log("📲 Incoming call from:", from, "| session:", parentCallSid);

          activeCallRef.current = {
            callType: 'inbound',
            phoneNumber: from,
            localNumber,
            callSid: parentCallSid,
            parentCallSid,
            accepted: false,
            logged: false
          };

          setIncomingCall({
            from,
            callSid: parentCallSid,
            ...callerContext
          });
          setIsIncomingMinimized(false);
          setConnection(conn);
          startIncomingAlerts(from);

          conn.on('cancel', () => resolveInboundCallEndRef.current());
          conn.on('disconnect', () => {
            if (activeCallRef.current?.accepted) {
              handleCallEnd(conn, {
                phoneNumber: from,
                localNumber,
                callType: 'inbound',
                status: 'completed'
              });
            } else {
              resolveInboundCallEndRef.current();
            }
          });
          conn.on('reject', () => {
            if (activeCallRef.current) {
              activeCallRef.current = {
                ...activeCallRef.current,
                rejected: true
              };
            }
          });
          conn.on('error', () => resolveInboundCallEndRef.current());
        });

        twilioDevice.on('error', (err) => {
          console.error('Twilio Device Error:', err);
          setDeviceState(DEVICE_STATES.ERROR);
          setDeviceError(err.message || 'Phone service error');
          setCallStatus('Device error');

          if (err.code === 20104 || err.code === 31205 || err.code === 31204) {
            refreshDeviceToken(twilioDevice).then((refreshed) => {
              if (refreshed && !disposed) {
                twilioDevice.register().catch(() => {});
              }
            });
          }
        });

        setDeviceState(DEVICE_STATES.REGISTERING);
        await twilioDevice.register();
        if (disposed) return;

        setDevice(twilioDevice);
        console.log('Twilio Device Registered');
      } catch (err) {
        console.error('Device Initialization Error:', err);
        setDeviceState(DEVICE_STATES.OFFLINE);
        setDeviceError(err.message || 'Unable to connect phone service');
        setCallStatus('Device offline');
      }
    };

    initDevice();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      deviceRef.current = null;
      if (twilioDevice) {
        twilioDevice.destroy();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchInboundSession = async ({ callSid, phoneNumber, localNumber }, attempts = 3) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const params = new URLSearchParams();
        if (phoneNumber) params.set('phoneNumber', phoneNumber);
        if (localNumber) params.set('localNumber', localNumber);
        const query = params.toString();
        const res = await fetch(
          `${BACKEND_URL}/api/calls/session/${encodeURIComponent(callSid)}${query ? `?${query}` : ''}`,
          {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
          }
        );

        if (res.ok) {
          const session = await res.json();
          if (session.status === 'answered' || attempt === attempts - 1) {
            return session;
          }
        }
      } catch (err) {
        console.error('Failed to fetch inbound session:', err);
      }

      await new Promise((resolve) => window.setTimeout(resolve, 400));
    }

    return null;
  };

  const logCall = async ({ phoneNumber, localNumber, callType, duration, status, callSid, answeredBy }) => {
    const currentCall = activeCallRef.current;
    if (currentCall?.callSid === callSid && currentCall.logged) return;

    if (currentCall?.callSid === callSid) {
      activeCallRef.current = { ...currentCall, logged: true };
    }

    try {
      await fetch(`${BACKEND_URL}/api/calls/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          phoneNumber,
          localNumber,
          callType,
          duration,
          status,
          callSid,
          answeredBy
        })
      });

      window.dispatchEvent(new Event('refreshCallHistory'));
    } catch (err) {
      console.error(err);
    }
  };

  const clearIncomingCallState = () => {
    setIncomingCall(null);
    setIsIncomingMinimized(false);
    setConnection(null);
    stopIncomingAlerts();
    resetCall();
  };

  const resolveInboundCallEnd = async () => {
    const currentCall = activeCallRef.current;
    if (!currentCall || currentCall.callType !== 'inbound') {
      clearIncomingCallState();
      return;
    }

    if (currentCall.accepted) {
      clearIncomingCallState();
      return;
    }

    if (currentCall.logged) {
      clearIncomingCallState();
      return;
    }

    const {
      phoneNumber: targetNumber,
      localNumber,
      callSid,
      rejected,
      teammateAnswered,
      answeredBy: teammateAnsweredBy
    } = currentCall;
    const currentUserId = getUserId(currentUserRef.current);

    if (teammateAnswered && teammateAnsweredBy && String(teammateAnsweredBy) !== currentUserId) {
      await logCall({
        phoneNumber: targetNumber,
        localNumber,
        callType: 'inbound',
        status: 'answered-by-teammate',
        duration: 0,
        callSid,
        answeredBy: teammateAnsweredBy
      });
      clearIncomingCallState();
      return;
    }

    const session = callSid
      ? await fetchInboundSession({ callSid, phoneNumber: targetNumber, localNumber })
      : null;
    if (session?.status === 'answered' && session.answeredBy && String(session.answeredBy) !== currentUserId) {
      await logCall({
        phoneNumber: targetNumber,
        localNumber,
        callType: 'inbound',
        status: 'answered-by-teammate',
        duration: 0,
        callSid,
        answeredBy: session.answeredBy
      });
      clearIncomingCallState();
      return;
    }

    await logCall({
      phoneNumber: targetNumber,
      localNumber,
      callType: 'inbound',
      status: rejected ? 'rejected' : 'missed',
      duration: 0,
      callSid
    });
    clearIncomingCallState();
  };

  resolveInboundCallEndRef.current = resolveInboundCallEnd;

  const makeCall = async () => {
    if (!phoneNumber.trim()) return alert('Please enter a valid number');
    if (!device || !isDeviceReady) {
      return alert('Phone service is not ready yet. Wait for Ready status or tap Retry on the connection banner.');
    }

    setIsMinimized(false);
    setIsCalling(true);
    setCallStatus('Ringing...');
    setDuration(0);
    stopTimer();
    startTimeRef.current = null;

    try {
      const conn = await device.connect({ params: { To: phoneNumber.trim() } });
      setConnection(conn);
      activeCallRef.current = {
        callType: 'outbound',
        phoneNumber: phoneNumber.trim(),
        callSid: conn?.parameters?.CallSid || '',
        accepted: false,
        logged: false
      };

      const handleOutboundAccept = () => {
        if (activeCallRef.current?.accepted) return;
        setCallStatus('Connected');
        startTimer();
        activeCallRef.current = {
          ...(activeCallRef.current || {}),
          accepted: true,
          callSid: conn?.parameters?.CallSid || activeCallRef.current?.callSid || ''
        };
      };

      const isAlreadyOpen = (typeof conn.state === 'function' && conn.state() === 'open') ||
                            (typeof conn.status === 'function' && conn.status() === 'open');

      if (isAlreadyOpen) {
        handleOutboundAccept();
      } else {
        conn.on('accept', handleOutboundAccept);
      }

      conn.on('ringing', () => {
        setCallStatus('Ringing...');
      });

      conn.on('reconnecting', () => {
        setCallStatus('Reconnecting...');
      });

      conn.on('reconnected', () => {
        setCallStatus('Connected');
      });

      conn.on('disconnect', () => handleCallEnd(conn));
      conn.on('error', () => handleCallEnd(conn, { status: 'failed' }));
    } catch (err) {
      console.error(err);
      resetCall();
    }
  };

  const handleCallEnd = async (conn, overrides = {}) => {
    const finalDuration = startTimeRef.current
      ? Math.floor((Date.now() - startTimeRef.current) / 1000)
      : 0;

    stopTimer();

    await logCall({
      phoneNumber: overrides.phoneNumber || activeCallRef.current?.phoneNumber || phoneNumber.trim(),
      localNumber: overrides.localNumber || activeCallRef.current?.localNumber || '',
      callType: overrides.callType || activeCallRef.current?.callType || 'outbound',
      duration: finalDuration,
      status: overrides.status || 'completed',
      callSid: conn?.parameters?.CallSid || activeCallRef.current?.callSid || ''
    });

    resetCall();
  };

  const resetCall = () => {
    stopTimer();
    startTimeRef.current = null;
    setIsCalling(false);
    setCallStatus(isDeviceReady ? 'Ready' : 'Device offline');
    setDuration(0);
    setConnection(null);
    setIsMuted(false);
    setIsOnHold(false);
    setIsSpeakerOn(false);
    setShowKeypad(false);
    setIsMinimized(false);
    setIsIncomingMinimized(false);
  };

  resetCallRef.current = resetCall;

  const handleMinimizeDialer = () => {
    setIsMinimized(true);
  };

  const handleCloseDialer = () => {
    if (isCalling) {
      // While call is active, minimize to keep call alive while freeing user's screen
      setIsMinimized(true);
      return;
    }

    setDialerMotion('closing');
    clearTimeout(dialerAnimationRef.current);
    dialerAnimationRef.current = setTimeout(() => {
      onClose?.();
    }, DIALER_ANIMATION_MS);
  };

  const restoreDialer = () => {
    clearTimeout(dialerAnimationRef.current);
    setIsMinimized(false);
  };

  const endCall = () => connection && connection.disconnect();

  const toggleMute = () => {
    if (connection) {
      const newMuted = !isMuted;
      connection.mute(newMuted);
      setIsMuted(newMuted);
    }
  };

  const toggleSpeaker = () => setIsSpeakerOn(!isSpeakerOn);

  const toggleHold = () => {
    if (connection) {
      const newHold = !isOnHold;
      connection.mute(newHold);
      setIsOnHold(newHold);
      setCallStatus(newHold ? 'On Hold' : 'Connected');
    }
  };

  const sendDTMF = (digit) => connection && connection.sendDigits(digit);

  const markCallAnswered = async ({ callSid, phoneNumber: numberToAnswer, localNumber }) => {
    if (!callSid) return;

    try {
      await fetch(`${BACKEND_URL}/api/calls/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ callSid, phoneNumber: numberToAnswer, localNumber })
      });
    } catch (err) {
      console.error('Failed to mark call answered:', err);
    }
  };

  // Accept Incoming Call
  const acceptIncomingCall = async () => {
    if (connection) {
      const parentCallSid = activeCallRef.current?.parentCallSid
        || getParentCallSid(connection)
        || activeCallRef.current?.callSid
        || '';

      connection.accept();
      activeCallRef.current = {
        ...(activeCallRef.current || {}),
        accepted: true,
        callSid: parentCallSid,
        parentCallSid
      };

      await markCallAnswered({
        callSid: parentCallSid,
        phoneNumber: activeCallRef.current?.phoneNumber,
        localNumber: activeCallRef.current?.localNumber
      });
      stopIncomingAlerts();
      setIncomingCall(null);
      setIsIncomingMinimized(false);
      setIsMinimized(false);
      setPhoneNumber(activeCallRef.current?.phoneNumber || '');
      setIsCalling(true);
      setCallStatus('Connected');
      startTimer();
    }
  };

  // Reject Incoming Call
  const rejectIncomingCall = () => {
    if (connection) {
      activeCallRef.current = {
        ...(activeCallRef.current || {}),
        rejected: true
      };
      connection.reject();
    }
    stopIncomingAlerts();
    setIncomingCall(null);
    setIsIncomingMinimized(false);
    setConnection(null);
  };

  // Dragging handlers for header
  const handleDragStart = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest('button, input, select, textarea, a, [role="button"]')) return;

    const panel = panelRef.current;
    if (!panel) return;

    const rect = panel.getBoundingClientRect();
    const originX = position ? position.x : rect.left;
    const originY = position ? position.y : rect.top;

    dragDataRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      originX,
      originY
    };

    const handlePointerMove = (moveEvent) => {
      if (!dragDataRef.current.isDragging) return;
      const deltaX = moveEvent.clientX - dragDataRef.current.startX;
      const deltaY = moveEvent.clientY - dragDataRef.current.startY;

      const panelWidth = rect.width || 340;
      const panelHeight = rect.height || 480;

      const maxX = Math.max(8, window.innerWidth - panelWidth - 8);
      const maxY = Math.max(8, window.innerHeight - panelHeight - 8);

      const nextX = Math.min(maxX, Math.max(8, dragDataRef.current.originX + deltaX));
      const nextY = Math.min(maxY, Math.max(8, dragDataRef.current.originY + deltaY));

      setPosition({ x: nextX, y: nextY });
    };

    const handlePointerUp = () => {
      dragDataRef.current.isDragging = false;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleHeaderDoubleClick = () => {
    setPosition(null);
  };

  return (
    <>
      {/* Incoming Call Alert (Modal with subtle backdrop and minimize support) */}
      {incomingCall && !isIncomingMinimized && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] px-4 pointer-events-auto">
          <div className="bg-[#1C2333] border border-gray-600 rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl">
            <div className="flex justify-end -mt-2 -mr-2 mb-1">
              <button
                type="button"
                onClick={() => setIsIncomingMinimized(true)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-700/50 transition"
                title="Minimize incoming call (keep working)"
              >
                <Minus className="h-4 w-4" />
              </button>
            </div>
            <div className="mb-4">
              <div className="w-14 h-14 bg-emerald-500/20 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto text-emerald-400 animate-pulse">
                <PhoneIncoming className="h-7 w-7" />
              </div>
            </div>
            <p className="text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-1">Incoming Call</p>
            <p className="text-xl font-medium text-white mb-6 break-all">
              {incomingCall.from || 'Unknown Number'}
            </p>
            {incomingCall.lastHandledByName && (
              <div className="mb-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-left">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Recent company history</p>
                <p className="mt-1 text-sm text-white">
                  Last handled by {incomingCall.lastHandledByName}
                </p>
                {incomingCall.lastHandledAt && (
                  <p className="mt-0.5 text-xs text-gray-300">
                    {formatLastHandledAt(incomingCall.lastHandledAt)}
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={rejectIncomingCall}
                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl text-sm font-medium transition-all"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={acceptIncomingCall}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-emerald-600/30"
              >
                Accept Call
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Incoming Call Minimized Widget */}
      {incomingCall && isIncomingMinimized && (
        <div className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-[60] flex max-w-[calc(100vw-2rem)] items-center gap-2.5 rounded-2xl border border-emerald-500/40 bg-[#161B28]/95 backdrop-blur-md px-3.5 py-3 shadow-2xl text-white">
          <button
            type="button"
            onClick={() => setIsIncomingMinimized(false)}
            className="flex min-w-0 items-center gap-2.5 text-left group hover:opacity-90 transition"
            title="Click to view incoming call details"
          >
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </span>
            <div className="min-w-0">
              <span className="block truncate text-xs font-semibold text-white max-w-[130px] sm:max-w-[180px]">
                {incomingCall.from || 'Incoming Call'}
              </span>
              <span className="block text-[11px] text-emerald-300 truncate max-w-[140px]">
                {incomingCall.lastHandledByName
                  ? `Last: ${incomingCall.lastHandledByName}`
                  : 'Ringing…'}
              </span>
            </div>
          </button>
          <div className="flex items-center gap-1.5 pl-1.5 border-l border-gray-700">
            <button
              type="button"
              onClick={rejectIncomingCall}
              className="rounded-xl bg-gray-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-600 transition"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={acceptIncomingCall}
              className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 shadow-md shadow-emerald-600/30 transition"
            >
              Accept
            </button>
          </div>
        </div>
      )}

      {/* Sidebar Connection Status Box Portal */}
      {!isCalling && !incomingCall && deviceState !== DEVICE_STATES.READY && targetStatusNode && (
        createPortal(
          <div
            className={`dialer-sidebar-status-box w-[260px] shrink-0 md:w-full md:mt-3 rounded-xl border p-2.5 shadow-lg transition-all ${
              deviceState === DEVICE_STATES.ERROR || deviceState === DEVICE_STATES.OFFLINE
                ? 'status-error border-amber-500/30 bg-[#1A1410]'
                : 'status-connecting border-sky-500/25 bg-[#101A28]'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      deviceState === DEVICE_STATES.ERROR || deviceState === DEVICE_STATES.OFFLINE
                        ? 'bg-amber-400'
                        : 'bg-sky-400 animate-pulse'
                    }`}
                  />
                  <p className="status-title text-xs font-semibold text-white truncate">
                    {deviceState === DEVICE_STATES.ERROR || deviceState === DEVICE_STATES.OFFLINE
                      ? 'Not receiving calls'
                      : 'Connecting phone service'}
                  </p>
                </div>
                <p className="status-text mt-1 text-[11px] leading-snug text-gray-300 break-words">
                  {deviceError || (
                    deviceState === DEVICE_STATES.REFRESHING
                      ? 'Refreshing connection so shared numbers keep ringing.'
                      : 'Stay on this page to receive inbound calls on shared numbers.'
                  )}
                </p>
              </div>
              {(deviceState === DEVICE_STATES.ERROR || deviceState === DEVICE_STATES.OFFLINE) && (
                <button
                  type="button"
                  onClick={retryDeviceRegistration}
                  className="shrink-0 rounded-lg bg-amber-500 px-2 py-1 text-[11px] font-semibold text-[#1A1410] hover:bg-amber-400 transition"
                >
                  Retry
                </button>
              )}
            </div>
          </div>,
          targetStatusNode
        )
      )}

      {/* Minimized Floating Bar / Pill */}
      {shouldShowMinimized && (
        isCalling ? (
          <div
            className="dialer-minimized-pill fixed bottom-4 right-2 sm:right-4 md:bottom-6 md:right-6 z-50 flex items-center gap-2 rounded-2xl border border-emerald-500/40 bg-[#161B28]/95 backdrop-blur-md px-3.5 py-2.5 shadow-2xl ring-1 ring-emerald-500/20 text-white max-w-[calc(100vw-1rem)]"
          >
            {/* Click to expand */}
            <button
              type="button"
              onClick={restoreDialer}
              className="flex items-center gap-2.5 text-left group min-w-0 pr-1 hover:opacity-90 transition"
              title="Click to expand dialer"
            >
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-white max-w-[130px] sm:max-w-[180px]">
                  {phoneNumber || 'Active Call'}
                </p>
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-mono">
                  <span>{formatDuration(duration)}</span>
                  <span className="text-gray-400">•</span>
                  <span className="text-gray-300 truncate max-w-[80px]">{callStatus}</span>
                </div>
              </div>
            </button>

            {/* In-pill Quick Actions */}
            <div className="flex items-center gap-1 pl-1 border-l border-gray-700/80">
              <button
                type="button"
                onClick={toggleMute}
                className={`p-2 rounded-xl transition ${
                  isMuted
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white'
                }`}
                title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>

              <button
                type="button"
                onClick={toggleHold}
                className={`p-2 rounded-xl transition ${
                  isOnHold
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white'
                }`}
                title={isOnHold ? 'Resume call' : 'Put call on hold'}
              >
                {isOnHold ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              </button>

              <button
                type="button"
                onClick={endCall}
                className="p-2 rounded-xl bg-red-600 hover:bg-red-500 text-white shadow-md shadow-red-600/30 transition hover:scale-105 active:scale-95"
                title="End call"
              >
                <PhoneOff className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={restoreDialer}
                className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition"
                title="Expand dialer"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <div
            className="dialer-minimized-pill fixed bottom-4 right-2 sm:right-4 md:bottom-6 md:right-6 z-50 flex items-center gap-2.5 rounded-full border border-gray-700/80 bg-[#161B28]/95 backdrop-blur-md px-3.5 py-2 shadow-2xl text-white hover:border-emerald-500/40 transition max-w-[calc(100vw-1rem)]"
          >
            <button
              type="button"
              onClick={restoreDialer}
              className="flex items-center gap-2 text-left group min-w-0 hover:opacity-90 transition"
              title="Click to expand dialer"
            >
              <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Phone className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 pr-1">
                <p className="truncate text-xs font-semibold text-white max-w-[130px]">
                  {phoneNumber || 'Dialer'}
                </p>
                <p className="text-[10px] text-emerald-400 font-medium">Ready</p>
              </div>
            </button>

            <div className="flex items-center gap-1 border-l border-gray-700/80 pl-1.5">
              <button
                type="button"
                onClick={restoreDialer}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
                title="Expand dialer"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleCloseDialer}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-gray-800 transition"
                title="Close dialer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )
      )}

      {/* Full Floating Dialer Window (NO blocking backdrop - full app remains interactive) */}
      {shouldRenderDialer && (
        <div
          ref={panelRef}
          style={position ? {
            left: `${position.x}px`,
            top: `${position.y}px`,
            right: 'auto',
            bottom: 'auto'
          } : undefined}
          className={`dialer-floating-card dialer-panel-${dialerMotion} fixed ${
            position ? '' : 'bottom-4 right-2 sm:right-4 md:bottom-6 md:right-6'
          } z-50 w-[calc(100vw-1rem)] sm:w-[340px] max-w-[340px] rounded-2xl border border-gray-700 bg-[#161B28] text-white shadow-2xl flex flex-col overflow-hidden select-none`}
        >
          {/* Draggable Header */}
          <div
            onPointerDown={handleDragStart}
            onDoubleClick={handleHeaderDoubleClick}
            className="flex items-center justify-between border-b border-gray-700/80 bg-[#1C2333] px-3.5 py-2.5 cursor-grab active:cursor-grabbing"
            title="Drag to move • Double-click to reset position"
          >
            <div className="flex items-center gap-2 min-w-0">
              <GripHorizontal className="h-4 w-4 text-gray-400 shrink-0" />
              <div className="flex items-center gap-2 min-w-0">
                {isCalling ? (
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                  </span>
                ) : (
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${isDeviceReady ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                )}
                <span className="text-xs font-semibold truncate text-white">
                  {isCalling ? `Active Call • ${formatDuration(duration)}` : 'Phone Dialer'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {position && (
                <button
                  type="button"
                  onClick={() => setPosition(null)}
                  className="rounded-lg p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition"
                  title="Reset position to corner"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={handleMinimizeDialer}
                className="rounded-lg p-1 text-gray-400 hover:text-white hover:bg-gray-800 transition"
                title="Minimize dialer"
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleCloseDialer}
                className="rounded-lg p-1 text-gray-400 hover:text-red-400 hover:bg-gray-800 transition"
                title={isCalling ? 'Minimize dialer (call active)' : 'Close dialer'}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Panel Content */}
          <div className="p-4">
            <div className="w-full max-w-[280px] mx-auto">
              {/* Device Status Badge */}
              <div className={`mb-3.5 rounded-xl border px-3 py-1.5 text-center text-xs ${
                isDeviceReady
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                  : 'border-amber-500/25 bg-amber-500/10 text-amber-200'
              }`}>
                <span className="font-medium text-[11px]">
                  {isDeviceReady
                    ? 'Ready to make and receive calls'
                    : deviceState === DEVICE_STATES.REFRESHING
                      ? 'Refreshing phone connection…'
                      : deviceState === DEVICE_STATES.REGISTERING || deviceState === DEVICE_STATES.INITIALIZING
                        ? 'Connecting phone service…'
                        : 'Not receiving calls'}
                </span>
                {!isDeviceReady && deviceError && (
                  <span className="mt-0.5 block text-[10px] text-amber-100/80">{deviceError}</span>
                )}
              </div>

              {/* Number Display Box */}
              <div className="bg-[#1C2333]/70 border border-gray-700/80 rounded-xl p-3 mb-4 text-center">
                <p className="text-emerald-400 text-[10px] font-semibold tracking-wider uppercase mb-1">
                  United States • +1
                </p>
                <div className="text-2xl font-light font-mono text-white min-h-[34px] flex items-center justify-center tracking-wider break-all">
                  {phoneNumber || <span className="text-gray-500 text-lg font-sans">Enter number</span>}
                </div>
              </div>

              {/* Active Call Controls */}
              {isCalling ? (
                <div className="dialer-call-card bg-gradient-to-br from-[#1A2333] to-[#121A2A] border border-gray-700/80 rounded-2xl p-4 text-center">
                  <p className="text-sm font-medium text-white mb-0.5 break-all">{phoneNumber}</p>
                  <p className={`text-xs text-emerald-400 font-medium ${showKeypad ? 'mb-2' : 'mb-3'}`}>{callStatus}</p>

                  {!showKeypad && (
                    <p className="text-3xl font-mono font-light text-white mb-5 tracking-tight">
                      {formatDuration(duration)}
                    </p>
                  )}

                  <div className="min-h-[120px]">
                    {showKeypad ? (
                      <div className="grid grid-cols-3 gap-2">
                        {['1','2','3','4','5','6','7','8','9','*','0','#'].map((digit) => (
                          <button
                            key={digit}
                            type="button"
                            onClick={() => sendDTMF(digit)}
                            className="h-9 bg-gray-800 hover:bg-gray-700 active:scale-95 rounded-lg text-lg text-white font-medium transition"
                          >
                            {digit}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2.5 mb-3">
                        <button
                          type="button"
                          onClick={toggleMute}
                          className={`p-3 rounded-xl transition flex flex-col items-center justify-center gap-1 active:scale-95 ${
                            isMuted
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                              : 'bg-gray-800 hover:bg-gray-700 text-gray-200'
                          }`}
                          title={isMuted ? 'Unmute' : 'Mute'}
                        >
                          {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                          <span className="text-[10px] font-medium">{isMuted ? 'Unmute' : 'Mute'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={toggleSpeaker}
                          className={`p-3 rounded-xl transition flex flex-col items-center justify-center gap-1 active:scale-95 ${
                            isSpeakerOn
                              ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                              : 'bg-gray-800 hover:bg-gray-700 text-gray-200'
                          }`}
                          title="Speaker"
                        >
                          {isSpeakerOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                          <span className="text-[10px] font-medium">Speaker</span>
                        </button>

                        <button
                          type="button"
                          onClick={toggleHold}
                          className={`p-3 rounded-xl transition flex flex-col items-center justify-center gap-1 active:scale-95 ${
                            isOnHold
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-gray-800 hover:bg-gray-700 text-gray-200'
                          }`}
                          title={isOnHold ? 'Resume' : 'Hold'}
                        >
                          {isOnHold ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
                          <span className="text-[10px] font-medium">{isOnHold ? 'Resume' : 'Hold'}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <div className={`grid gap-2 ${showKeypad ? 'grid-cols-2 mt-2.5' : 'grid-cols-1'}`}>
                    <button
                      type="button"
                      onClick={() => setShowKeypad(!showKeypad)}
                      className={`flex items-center justify-center gap-1.5 ${
                        showKeypad ? 'py-2 text-xs' : 'py-2.5 text-xs'
                      } bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-xl font-medium transition`}
                    >
                      <Hash className="h-3.5 w-3.5" />
                      {showKeypad ? 'Hide Keypad' : 'Show Keypad'}
                    </button>

                    <button
                      type="button"
                      onClick={endCall}
                      className={`flex items-center justify-center gap-1.5 ${
                        showKeypad ? 'py-2 text-xs' : 'py-3 text-sm'
                      } bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold transition shadow-lg shadow-red-600/30 active:scale-95`}
                    >
                      <PhoneOff className="h-4 w-4" />
                      End Call
                    </button>
                  </div>
                </div>
              ) : (
                /* Normal Keypad Screen */
                <>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {['1','2','3','4','5','6','7','8','9','*','0','#'].map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setPhoneNumber((prev) => prev + key)}
                        className="h-11 bg-[#1F2937] hover:bg-[#374151] active:bg-[#4B5563] active:scale-95 rounded-xl text-xl font-light text-white transition flex items-center justify-center"
                      >
                        {key}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-center gap-4">
                    <button
                      type="button"
                      onClick={() => setPhoneNumber('')}
                      disabled={!phoneNumber}
                      className="w-10 h-10 flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-full transition disabled:opacity-30 disabled:pointer-events-none"
                      title="Clear number"
                    >
                      <X className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={makeCall}
                      disabled={!phoneNumber.trim()}
                      className="w-14 h-14 flex items-center justify-center bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-700 text-white rounded-full shadow-xl shadow-emerald-500/30 transition active:scale-95 disabled:shadow-none disabled:opacity-40"
                      title="Start Call"
                    >
                      <Phone className="h-6 w-6" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setPhoneNumber((prev) => prev.slice(0, -1))}
                      disabled={!phoneNumber}
                      className="w-10 h-10 flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-full transition disabled:opacity-30 disabled:pointer-events-none"
                      title="Backspace"
                    >
                      <Delete className="h-4 w-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Dialer;
