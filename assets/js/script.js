  // Pagination automatique

(function () {
  const sections = {
    "carnets": [
      "24-25-pastels",
      "24-25-encre-noire",
      "23-24-portraits-hiver",
      "23-portraits-automne",
      "22-23-portraits-encres",
      "22-24-musees",
      "20-25-balades-paris",
      "22-faro",
      "21-23-bretagne",
      "19-avene"
    ],
    "divers": [
      "24-lucky",
      "24-poules",
      "22-ciels",
      "18-kunlun"
    ],
    "florent-marchet": [
      "freddie-mercury",
      "le-monde-du-vivant"
    ],
  };

   let path = window.location.pathname.toLowerCase();

  // 🔥 IMPORTANT : on enlève index.html si présent
  path = path.replace(/index\.html$/, "");

  const segments = path.split('/').filter(seg => seg);

  // 👉 Exemple attendu :
  // /dessins/carnets/19-avene/
  // segments = ["dessins", "carnets", "19-avene"]

  const section = segments[segments.length - 2];
  const currentFolder = segments[segments.length - 1];

  if (!sections[section]) {
    console.warn("Pagination : section non trouvée", section);
    return;
  }

  const pages = sections[section];
  const index = pages.indexOf(currentFolder);

  if (index === -1) {
    console.warn("Pagination : dossier non trouvé dans la section", currentFolder);
    return;
  }

  const nav = document.createElement("nav");
  nav.className = "pagination";
  nav.setAttribute("aria-label", "Pagination");

  if (index > 0) {
    const prev = document.createElement("a");
    prev.href = `/dessins/${section}/${pages[index - 1]}/`;
    prev.textContent = "←";
    nav.appendChild(prev);
  }

  const home = document.createElement("a");
  home.href = "/dessins/";
  home.textContent = "Retour";
  home.className = "pagination-home";
  nav.appendChild(home);

  if (index < pages.length - 1) {
    const next = document.createElement("a");
    next.href = `/dessins/${section}/${pages[index + 1]}/`;
    next.textContent = "→";
    nav.appendChild(next);
  }

  const container = document.getElementById("pagination");
  if (container) container.appendChild(nav);
  else document.body.appendChild(nav);
})();


// Bouton backtotop

const backToTop = document.getElementById("backToTop");
if (backToTop) {
  window.addEventListener("scroll", () => {
    if (document.body.classList.contains("modal-open")) {
      backToTop.classList.remove("show");
      return;
    }
    if (window.scrollY > 300) {
      backToTop.classList.add("show");
    } else {
      backToTop.classList.remove("show");
    }
  });

  backToTop.addEventListener("click", () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  });
}