// theme.js - Clinical Noir Theme Logic
function toggleTheme(){
  document.body.classList.toggle('light');
  const isLight = document.body.classList.contains('light');
  localStorage.setItem('onvilox_theme', isLight ? 'light' : 'dark');
  updateThemeUI();
}

function updateThemeUI(){
  const isLight = document.body.classList.contains('light');
  const btnIcon = document.getElementById('themeIcon');
  const btnLabel = document.getElementById('themeLabel');
  
  if(btnIcon) btnIcon.textContent = isLight ? '☀️' : '🌙';
  if(btnLabel) btnLabel.textContent = isLight ? 'Light' : 'Dark';
}

(function(){
  const saved = localStorage.getItem('onvilox_theme') || 'dark';
  if(saved === 'light') document.body.classList.add('light');
  // Run update after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateThemeUI);
  } else {
    updateThemeUI();
  }
})();
