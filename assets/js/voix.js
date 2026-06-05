const player = document.getElementById('player');
const button = document.getElementById('play-random');
const toggle = document.getElementById('toggle');
const playedList = document.getElementById('played-list');
const progress = document.getElementById('progress');
const nowPlaying = document.getElementById('now-playing');
const timeDisplay = document.getElementById('time-display');

const sortDateBtn = document.getElementById('sort-date');
const sortAddedBtn = document.getElementById('sort-added');
const sortControls = document.getElementById('sort-controls');

const playedFiles = new Set();
let hasStarted = false;

let currentFile = null;

/* -------------------- UTILS -------------------- */

function formatName(file) {
  let name = decodeURIComponent(file.split('/').pop().replace(/\.[^/.]+$/, ''));

  // supprime le suffixe _e éventuel
  name = name.replace(/_e$/i, '');

  // split date / time
  const parts = name.split(' - ');
  if (parts.length !== 2) return name;

  const date = parts[0];
  let time = parts[1];

  // transforme 00_29 -> 00:29
  time = time.replace(/(\d{2})_(\d{2})/, '$1:$2');

  return `${date} - ${time}`;
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function scrollToActive(li) {
  if (!li) return;

  li.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

/* -------------------- ACTIVE STATE -------------------- */

function setActive(file) {
  currentFile = file;

  document.querySelectorAll('#played-list li').forEach(li => {
    li.classList.remove('active');
  });

  const active = document.querySelector(
    `#played-list li[data-file="${file}"]`
  );

  if (active) {
    active.classList.add('active');
    scrollToActive(active); // 🔥 auto scroll ici
  }
}

/* -------------------- UI PLAYER -------------------- */

function updateProgressBar() {
  const percent = (player.currentTime / player.duration) * 100 || 0;
  progress.value = percent;

  progress.style.background =
    `linear-gradient(to right, #333 ${percent}%, rgba(0,0,0,0.15) ${percent}%)`;
}

function updateTimeDisplay() {
  timeDisplay.textContent =
    `${formatTime(player.currentTime)} / ${formatTime(player.duration)}`;
}

async function playAudio(audioObj) {
  try {
    player.src = audioObj.file;
    await player.play();

    nowPlaying.textContent = ``;

    // 🔥 IMPORTANT : surlignage fonctionne pour random + clic + liste
    setActive(audioObj.file);

  } catch (err) {
    console.log("Lecture bloquée :", err);
  }
}

/* -------------------- LIST RENDER -------------------- */

function renderList(list) {
  playedList.innerHTML = "";

  list.forEach(audio => {
    const li = document.createElement('li');
    li.textContent = formatName(audio.file);
    li.dataset.file = audio.file;

    li.addEventListener('click', () => playAudio(audio));

    playedList.appendChild(li);
  });

  // restaure surlignage si déjà en cours
  if (currentFile) setActive(currentFile);
}

/* -------------------- FIRST PLAY -------------------- */

button.addEventListener('click', async () => {
  if (playedFiles.size === audios.length) {
    alert("Vous avez écouté tous les enregistrements ! Mais d'autres viendront plus tard.");
    return;
  }

  if (!hasStarted) {
    hasStarted = true;

    button.textContent = "Un autre";

    toggle.hidden = false;
    nowPlaying.hidden = false;
    progress.hidden = false;
    timeDisplay.hidden = false;
    sortDateBtn.hidden = false;
    sortAddedBtn.hidden = false;

    toggle.textContent = "Pause";
  }

  let audioObj;
  do {
    audioObj = audios[Math.floor(Math.random() * audios.length)];
  } while (playedFiles.has(audioObj.file));

  await playAudio(audioObj);

  // ajout progressif à la liste
  if (!playedFiles.has(audioObj.file)) {
    const li = document.createElement('li');
    li.textContent = formatName(audioObj.file);
    li.dataset.file = audioObj.file;

    li.addEventListener('click', () => playAudio(audioObj));

    playedList.prepend(li);
    playedFiles.add(audioObj.file);
  }
});

/* -------------------- SORTS -------------------- */

sortDateBtn.addEventListener('click', () => {
  const sorted = [...audios].sort((a, b) =>
    new Date(b.date) - new Date(a.date)
  );
  renderList(sorted);
});

sortAddedBtn.addEventListener('click', () => {
  const sorted = [...audios].sort((a, b) =>
    b.added - a.added
  );
  renderList(sorted);
});

/* -------------------- CONTROLS -------------------- */

toggle.addEventListener('click', () => {
  if (player.paused) {
    player.play();
    toggle.textContent = "Pause";
  } else {
    player.pause();
    toggle.textContent = "Lire";
  }
});

player.addEventListener('play', () => {
  toggle.textContent = "Pause";
});

player.addEventListener('pause', () => {
  toggle.textContent = "Lire";
});

player.addEventListener('timeupdate', () => {
  updateProgressBar();
  updateTimeDisplay();
});

player.addEventListener('loadedmetadata', updateTimeDisplay);

/* -------------------- SEEK -------------------- */

progress.addEventListener('input', () => {
  if (!player.duration) return;
  player.currentTime = (progress.value / 100) * player.duration;
});

/* -------------------- KEYBOARD -------------------- */

document.addEventListener('keydown', (e) => {
  const tag = document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;

  if (e.code === 'Space') {
    e.preventDefault();
    player.paused ? player.play() : player.pause();
  }
});