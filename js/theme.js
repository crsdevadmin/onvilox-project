// theme.js
document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  const body = document.body;
  
  if (savedTheme === 'light') {
    body.classList.add('light-theme');
  } else {
    body.classList.remove('light-theme');
  }

  // Find the toggle button if it exists and set its initial state
  const btn = document.getElementById('themeToggleBtn');
  if(btn) {
    btn.innerHTML = savedTheme === 'light' ? '🌙 Dark Mode' : '☀️ Light Mode';
  }
});

function toggleTheme() {
  const body = document.body;
  const isLight = body.classList.toggle('light-theme');
  const btn = document.getElementById('themeToggleBtn');
  
  if (isLight) {
    localStorage.setItem('theme', 'light');
    if(btn) btn.innerHTML = '🌙 Dark Mode';
  } else {
    localStorage.setItem('theme', 'dark');
    if(btn) btn.innerHTML = '☀️ Light Mode';
  }
}
