// Caricato nel <head> prima del CSS: applica il tema salvato senza flash.
(function () {
  var t;
  try { t = localStorage.getItem('pannello-theme'); } catch (e) {}
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
})();
