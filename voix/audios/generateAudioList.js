const fs = require('fs');
const path = require('path');

const outputFile = 'audio-list.js';

// Lire les fichiers du dossier courant
const files = fs.readdirSync(__dirname);

// Filtrer les fichiers audio
const audioFiles = files.filter(file =>
  ['.aif', '.mp3', '.ogg'].includes(path.extname(file).toLowerCase())
);

// Trier les fichiers
audioFiles.sort();

// Générer le contenu du fichier JS
const content = `// Fichier généré automatiquement
const audios = [
${audioFiles.map(f => `  '/voix/audios/${encodeURIComponent(f)}',`).join('\n')}
];

// Usage : player.src = audios[Math.floor(Math.random() * audios.length)];
`;

// Écriture du fichier
fs.writeFileSync(path.join(__dirname, outputFile), content);

console.log(`Fichier ${outputFile} généré avec ${audioFiles.length} fichiers audio.`);