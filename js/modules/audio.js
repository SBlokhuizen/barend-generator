import { clearActiveHighlights } from "./ui.js";

const correctSound = new Audio("assets/audio/correct.mp3");
const wrongSound = new Audio("assets/audio/wrong.mp3");
export const victorySound = new Audio("assets/audio/victory.mp3");

export function preloadSounds() {
  correctSound.preload = "auto";
  wrongSound.preload = "auto";
  victorySound.preload = "auto";
}

export function playCorrectSound() {
  correctSound.currentTime = 0;
  correctSound.play().catch((e) => console.error("Audio play failed:", e));
}

export function playWrongSound() {
  wrongSound.currentTime = 0;
  wrongSound.play().catch((e) => console.error("Audio play failed:", e));
}

export function speakWord(text, settings, onend) {
  const u = new SpeechSynthesisUtterance(text);
  u.rate = settings.rate;
  u.pitch = settings.pitch;
  u.volume = 1.0;
  u.lang = settings.language || "nl-NL";
  const voices = speechSynthesis.getVoices() || [];
  const preferredVoice = voices.find((v) => v.lang === u.lang);
  if (preferredVoice) u.voice = preferredVoice;
  u.onend = onend;
  speechSynthesis.speak(u);
}

export function stopSpeech(isSilent = false) {
  speechSynthesis.cancel();
  if (!isSilent) {
    clearActiveHighlights();
  }
  return null; // To clear the playback ID in main.js
}
