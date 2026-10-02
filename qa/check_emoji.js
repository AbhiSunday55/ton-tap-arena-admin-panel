(() => {
  const tas = [...document.querySelectorAll('textarea')];
  const emojiTa = tas.find((t) => /[\u{1F300}-\u{1FAFF}]/u.test(t.value || ''));
  const rawEscape = tas.some((t) => (t.value || '').includes('\\ud83'));
  return JSON.stringify({
    heading: document.querySelector('h1') ? document.querySelector('h1').textContent : null,
    textareaCount: tas.length,
    emojiTextareaValue: emojiTa ? emojiTa.value : null,
    hasRawBackslashU: rawEscape,
  });
})()
