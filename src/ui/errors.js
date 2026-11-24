window.addEventListener('error', function(ev) {
  var box = document.getElementById('formMessage');
  if (box && ev && ev.message) {
    box.textContent = 'Erro de script: ' + ev.message + (ev.lineno ? ' (linha ' + ev.lineno + ')' : '');
    box.className = 'status-msg err';
  }
});
