// Service workers cannot play audio, so the chime lives in an offscreen document.
chrome.runtime.onMessage.addListener((msg: { target?: string; type?: string }) => {
  if (msg?.target !== 'offscreen' || msg.type !== 'play') return;
  const audio = document.getElementById('chime') as HTMLAudioElement | null;
  if (!audio) return;
  audio.currentTime = 0;
  void audio.play().catch(() => {});
});

export {};
