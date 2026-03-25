import { useEffect, useRef } from 'react';

function playAlarm() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;

    // Play a 3-beep alarm pattern
    const frequencies = [880, 880, 1100];
    const startTimes = [0, 0.3, 0.6];

    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'square';
      gain.gain.setValueAtTime(0.2, now + startTimes[i]);
      gain.gain.exponentialRampToValueAtTime(0.001, now + startTimes[i] + 0.2);
      osc.start(now + startTimes[i]);
      osc.stop(now + startTimes[i] + 0.25);
    });
  } catch (e) {
    // Audio not available
  }
}

export function useTaskAlarm(tasks) {
  const firedRef = useRef(new Set());

  useEffect(() => {
    const check = () => {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const currentTime =
        String(now.getHours()).padStart(2, '0') + ':' +
        String(now.getMinutes()).padStart(2, '0');

      tasks.forEach((task) => {
        if (
          task.status !== 'done' &&
          task.endDate &&
          task.date === todayStr &&
          task.endDate === currentTime &&
          !firedRef.current.has(task.id)
        ) {
          firedRef.current.add(task.id);
          playAlarm();

          if (Notification.permission === 'granted') {
            new Notification('Tarefa agendada', {
              body: task.title,
            });
          }
        }
      });
    };

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    check();
    const interval = setInterval(check, 15000); // check every 15s for better precision
    return () => clearInterval(interval);
  }, [tasks]);

  // Clean up old fired alarms at midnight
  useEffect(() => {
    const cleanup = () => {
      firedRef.current.clear();
    };
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight - now;
    const timer = setTimeout(cleanup, msUntilMidnight);
    return () => clearTimeout(timer);
  }, []);
}
