(() => {
  const controls = [...document.querySelectorAll('input[name]')];
  const status = document.querySelector('#status');
  let values;
  chrome.storage.local.get('settings', result => {
    if (chrome.runtime.lastError) { status.textContent = 'Could not load settings. Please reopen this page.'; return; }
    values = SifiYouTubeSettings.normalize(result.settings);
    for (const input of controls) {
      if (input.type === 'checkbox') input.checked = values[input.name];
      else input.value = values[input.name];
      input.disabled = false;
    }
    status.textContent = 'Settings saved automatically';
  });
  document.querySelector('form').addEventListener('change', async event => {
    const input = event.target;
    if (!controls.includes(input)) return;
    if (!input.checkValidity()) { status.textContent = `Choose a whole number from ${input.min} to ${input.max}${input.name === 'pageDelayMs' ? ' ms' : ''}.`; input.reportValidity(); return; }
    for (const control of controls) control.disabled = true;
    const previous = values;
    values = SifiYouTubeSettings.normalize({ ...values, [input.name]: input.type === 'checkbox' ? input.checked : Number(input.value) });
    try {
      await chrome.storage.local.set({ settings: values });
      status.textContent = 'Saved';
    } catch {
      values = previous;
      if (input.type === 'checkbox') input.checked = values[input.name];
      else input.value = values[input.name];
      status.textContent = 'Could not save. Please try again.';
    } finally {
      for (const control of controls) control.disabled = false;
    }
  });
})();
