/* diagnostics.js — Error indicator and AI dialog fallback for pre-boot state. */
window.ScriptLabBooted = false;
window.addEventListener('error', event => {
  if (window.ScriptLabBooted) return;
  const status = document.getElementById('save');
  if (status) status.textContent = 'Error JS: ' + event.message;
});
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('ai')?.addEventListener('click', () => {
    if (window.ScriptLabBooted) return;
    const dialog = document.getElementById('aidialog');
    if (dialog?.showModal) dialog.showModal();
  });
});