(function() {
  document.addEventListener('DOMContentLoaded', function() {
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      const updateIcon = function() {
        btn.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙';
      };
      updateIcon();
      btn.addEventListener('click', function() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
        updateIcon();
      });
    }

    // Auto-fill remembered name
    const rememberedName = localStorage.getItem('voter_name');
    document.querySelectorAll('input[name="voterName"], input[name="authorName"]').forEach(function(input) {
      if (rememberedName && !input.value) {
        input.value = rememberedName;
      }
      // Remember on change
      input.addEventListener('change', function() {
        if (this.value.trim()) {
          localStorage.setItem('voter_name', this.value.trim());
        }
      });
    });
  });
})();

// Toast notification system
function showToast(message, type) {
  type = type || 'success';
  var existing = document.getElementById('toast-container');
  if (!existing) {
    existing = document.createElement('div');
    existing.id = 'toast-container';
    existing.style.cssText = 'position:fixed;top:20px;right:20px;z-index:10000;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(existing);
  }
  var toast = document.createElement('div');
  toast.style.cssText = 'padding:14px 20px;border-radius:10px;color:white;font-size:14px;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,0.15);animation:toast-in 0.3s ease;max-width:320px;';
  toast.style.background = type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3';
  toast.textContent = message;
  existing.appendChild(toast);
  setTimeout(function() {
    toast.style.animation = 'toast-out 0.3s ease forwards';
    setTimeout(function() { toast.remove(); }, 300);
  }, 2500);
}
