const form = document.getElementById('form');
const message = document.getElementById('message');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  message.textContent = '';
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-LucianOS': '1' },
    body: JSON.stringify({ password: document.getElementById('password').value })
  });
  if (res.ok) {
    location.href = '/';
  } else {
    const data = await res.json().catch(() => ({}));
    message.textContent = data.error ?? 'Could not log in';
  }
});
