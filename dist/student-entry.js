(() => {
  const key = 'metalab-pocket-entry';
  const entry = document.getElementById('studentEntry');
  const form = document.getElementById('studentEntryForm');
  const app = document.querySelector('main.wrap');
  const message = document.getElementById('entryMessage');
  const localPreview = document.getElementById('localPreview');
  if (!entry || !form || !app) return;

  function showApp(name) {
    entry.hidden = true;
    app.inert = false;
    document.body.classList.add('student-ready');
    if (name) {
      const greeting = document.querySelector('.greeting strong');
      if (greeting) greeting.textContent = name;
    }
  }

  app.inert = true;
  if (location.protocol === 'file:') {
    form.hidden = true;
    localPreview.hidden = false;
    document.querySelector('.entry-privacy').hidden = true;
    document.getElementById('entryCardTitle').textContent = 'Prévia local do MetaLab Pocket.';
    document.getElementById('entryCardIntro').textContent = 'Você pode explorar o simulador sem registrar dados.';
    document.getElementById('previewWithoutSaving').onclick = () => showApp();
    return;
  }
  if (sessionStorage.getItem(key) === 'yes') {
    showApp();
    return;
  }

  const birthDate = form.elements.birthDate;
  birthDate.max = new Date().toLocaleDateString('en-CA');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const button = form.querySelector('button[type="submit"]');
    const name = form.elements.name.value.trim().replace(/\s+/g, ' ');
    const email = form.elements.email.value.trim();
    const value = birthDate.value;
    message.textContent = '';
    button.disabled = true;
    button.textContent = 'Salvando cadastro…';
    try {
      const response = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, birthDate: value })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.id) throw new Error(result.error || 'O cadastro não está disponível neste endereço.');
      sessionStorage.setItem(key, 'yes');
      form.reset();
      showApp(result.firstName);
    } catch (error) {
      message.textContent = error instanceof TypeError
        ? 'Não foi possível conectar ao cadastro. Abra a versão publicada na Vercel e tente novamente.'
        : error.message || 'Não foi possível salvar o cadastro. Tente novamente.';
    } finally {
      button.disabled = false;
      button.textContent = 'Entrar no MetaLab Pocket';
    }
  });
})();
