import { Capacitor } from '@capacitor/core';
import { LocalNotifications, ScheduleOptions } from '@capacitor/local-notifications';

let audioContext: AudioContext | null = null;
let ringtoneInterval: number | null = null;
let notificationId = 1;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

// Initialize native notification channels for Android
async function initNotificationChannels() {
  if (Capacitor.isNativePlatform()) {
    try {
      // Request permission
      const perm = await LocalNotifications.requestPermissions();
      if (perm.display !== 'granted') {
        console.warn('Notification permission not granted');
        return;
      }

      // Create notification channels for Android
      await LocalNotifications.createChannel({
        id: 'messages',
        name: 'Messages',
        description: 'New message notifications',
        sound: 'notification.wav',
        importance: 4, // HIGH
        visibility: 1, // PUBLIC
        vibration: true,
      });

      await LocalNotifications.createChannel({
        id: 'calls',
        name: 'Incoming Calls',
        description: 'Incoming call notifications',
        sound: 'ringtone.wav',
        importance: 5, // MAX
        visibility: 1, // PUBLIC
        vibration: true,
      });
    } catch (e) {
      console.warn('Failed to create notification channels:', e);
    }
  }
}

// Initialize on load
initNotificationChannels();

export function playNotificationSound() {
  try {
    const ctx = getAudioContext();
    
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;
    
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(440, now + 0.15);
    
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1320, now + 0.05);
    osc2.frequency.exponentialRampToValueAtTime(660, now + 0.2);
    
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.15, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
    gainNode.gain.linearRampToValueAtTime(0, now + 0.3);
    
    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    osc1.start(now);
    osc2.start(now + 0.05);
    
    osc1.stop(now + 0.3);
    osc2.stop(now + 0.3);
    
  } catch (e) {
    console.warn('Could not play notification sound:', e);
  }
}

export function playSendSound() {
  try {
    const ctx = getAudioContext();
    
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.08);
    
    gainNode.gain.setValueAtTime(0.1, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.1);
    
  } catch (e) {
    console.warn('Could not play send sound:', e);
  }
}

// Play a single ring tone burst
function playRingBurst() {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;

    // Create two oscillators for a pleasant two-tone ring
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';
    
    // Classic phone ring frequencies (440Hz and 480Hz)
    osc1.frequency.setValueAtTime(440, now);
    osc2.frequency.setValueAtTime(480, now);

    // Volume envelope - ring for 0.4s
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.25, now + 0.02);
    gainNode.gain.setValueAtTime(0.25, now + 0.35);
    gainNode.gain.linearRampToValueAtTime(0, now + 0.4);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.4);
    osc2.stop(now + 0.4);
  } catch (e) {
    console.warn('Could not play ring burst:', e);
  }
}

// Start repeating ringtone
export function startRingtone() {
  stopRingtone(); // Clear any existing
  
  // Play immediately
  playRingBurst();
  
  // Then repeat every 2 seconds (ring for 0.4s, pause for 1.6s)
  ringtoneInterval = window.setInterval(() => {
    playRingBurst();
  }, 2000);
}

// Stop the ringtone
export function stopRingtone() {
  if (ringtoneInterval) {
    clearInterval(ringtoneInterval);
    ringtoneInterval = null;
  }
}

// Show notification (native on mobile, browser on desktop)
export async function showNotification(title: string, body: string, tag?: string): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      // Native notification via Capacitor
      const options: ScheduleOptions = {
        notifications: [{
          id: notificationId++,
          title,
          body,
          channelId: 'messages',
          smallIcon: 'ic_stat_notification',
          largeIcon: 'ic_launcher',
          ongoing: false,
          autoCancel: true,
        }]
      };
      await LocalNotifications.schedule(options);
    } else {
      // Browser notification for desktop
      if (typeof Notification === 'undefined') return;
      if (Notification.permission === 'default') {
        await Notification.requestPermission();
      }
      
      if (typeof Notification === 'undefined') return;
      if (Notification.permission === 'granted') {
        const notification = new Notification(title, {
          body,
          icon: '/whispro-icon.png',
          tag: tag || undefined,
          requireInteraction: false,
          silent: true,
        });
        
        setTimeout(() => notification.close(), 5000);
        
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      }
    }
  } catch (e) {
    console.warn('Could not show notification:', e);
  }
}

// Show incoming call notification (native with call channel)
export async function showCallNotification(callerName: string): Promise<number> {
  const callNotifId = 9999; // Fixed ID for call notification so we can cancel it
  
  try {
    if (Capacitor.isNativePlatform()) {
      const options: ScheduleOptions = {
        notifications: [{
          id: callNotifId,
          title: 'Incoming Call',
          body: `${callerName} is calling...`,
          channelId: 'calls',
          smallIcon: 'ic_stat_notification',
          largeIcon: 'ic_launcher',
          ongoing: true,
          autoCancel: false,
        }]
      };
      await LocalNotifications.schedule(options);
    } else {
      // Browser notification
      if (typeof Notification === 'undefined') return callNotifId;
      if (Notification.permission === 'granted') {
        new Notification('Incoming Call', {
          body: `${callerName} is calling...`,
          icon: '/whispro-icon.png',
          tag: 'incoming-call',
          requireInteraction: true,
          silent: false,
        });
      }
    }
  } catch (e) {
    console.warn('Could not show call notification:', e);
  }
  
  return callNotifId;
}

// Cancel a specific notification
export async function cancelNotification(id: number): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      await LocalNotifications.cancel({ notifications: [{ id }] });
    }
  } catch (e) {
    console.warn('Could not cancel notification:', e);
  }
}
