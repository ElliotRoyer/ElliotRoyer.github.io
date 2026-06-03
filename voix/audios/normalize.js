const { execSync } = require("child_process");
const fs = require("fs");

const files = fs.readdirSync(".").filter(f => f.endsWith(".aif"));

files.forEach(file => {
  console.log(`\n🎧 Traitement de ${file}`);

  try {
    // 1ère passe (analyse) → stderr redirigé vers stdout
    const analysisOutput = execSync(
      `ffmpeg -i "${file}" -af loudnorm=I=-18:TP=-1.5:LRA=11:print_format=json -f null - 2>&1`,
      { encoding: "utf8" }
    );

    // ! C'est "loudnorm=I=-X" qui détermine le volume normalisé à la sortie (chiffre plus haut = volume plus fort)


    // Extraire le JSON
    const jsonMatch = analysisOutput.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);

    if (!jsonMatch) {
      console.error(analysisOutput); // debug utile
      throw new Error("Impossible de récupérer les données loudnorm");
    }

    const data = JSON.parse(jsonMatch[0]);

    const {
      input_i,
      input_tp,
      input_lra,
      input_thresh,
      target_offset
    } = data;

    // 2ème passe
    const outputFile = file.replace(/\.aif$/i, ".mp3");

    const cmd = `ffmpeg -i "${file}" -af "acompressor=threshold=-18dB:ratio=2:attack=20:release=250,loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${input_i}:measured_TP=${input_tp}:measured_LRA=${input_lra}:measured_thresh=${input_thresh}:offset=${target_offset}:linear=true:print_format=summary" -ar 44100 -ac 1 -c:a libmp3lame -b:a 128k "${outputFile}"`;

    execSync(cmd, { stdio: "inherit" });

    console.log(`✅ Terminé : ${outputFile}`);

  } catch (err) {
    console.error(`❌ Erreur avec ${file}`);
    console.error(err.message);
  }
});