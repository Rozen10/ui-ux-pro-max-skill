/* Exécuté dans <head>, avant le premier rendu (fichier externe : compatible CSP). */
(function () {
  var html = document.documentElement;
  html.classList.add("js");
  /* v5 : courte intro, une seule fois par session, jamais en mouvement réduit */
  try {
    if (html.getAttribute("data-variant") === "v5" &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
        !sessionStorage.getItem("sb-intro")) {
      html.classList.add("has-intro");
    }
  } catch (e) {}
})();
