/* =============================================
   VOICE GUIDANCE
   English: the browser's built-in speech engine (instant, works offline).
   Tamil:   a Tamil system voice if the device has one (most Android phones),
            otherwise the backend /api/tts (Google TTS) audio.
   Messages play one at a time; an urgent message (a turn) cuts in.
   ============================================= */

import { API_BASE } from '../api/api';

const queue = [];
let playing = false;
let currentAudio = null;
let generation = 0; // bumped on every stop so an interrupted message can't restart the queue

function findVoice(lang) {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  const prefix = lang === 'ta' ? 'ta' : 'en';
  return voices.find((v) => v.lang?.toLowerCase().startsWith(`${prefix}-in`))
    || voices.find((v) => v.lang?.toLowerCase().startsWith(prefix))
    || null;
}

// Voices load asynchronously in Chrome
if ('speechSynthesis' in window) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}

function speakWithBrowser(text, voice, lang) {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice?.lang || (lang === 'ta' ? 'ta-IN' : 'en-IN');
    u.rate = 1;
    u.onend = resolve;
    u.onerror = resolve;
    window.speechSynthesis.speak(u);
  });
}

function speakWithServer(text, lang) {
  return new Promise((resolve) => {
    const url = `${API_BASE}/api/tts?text=${encodeURIComponent(text)}&lang=${lang}&translate=0`;
    const audio = new Audio(url);
    currentAudio = audio;
    audio.onended = resolve;
    audio.onerror = resolve;
    audio.play().catch(resolve);
  });
}

async function playNext() {
  if (playing || !queue.length) return;
  playing = true;
  const gen = generation;
  const { text, lang } = queue.shift();
  const voice = findVoice(lang);
  try {
    if (lang === 'en' && 'speechSynthesis' in window) await speakWithBrowser(text, voice, lang);
    else if (lang === 'ta' && voice) await speakWithBrowser(text, voice, lang);
    else await speakWithServer(text, lang);
  } finally {
    if (gen === generation) {
      currentAudio = null;
      playing = false;
      playNext();
    }
  }
}

export function stopVoice() {
  generation++;
  queue.length = 0;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  playing = false;
}

export function speak(text, lang = 'en', { urgent = false } = {}) {
  if (!text) return;
  if (urgent) stopVoice();
  queue.push({ text, lang });
  playNext();
}
