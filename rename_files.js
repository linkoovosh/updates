import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicDir = path.join(__dirname, 'public');

const filesToRename = {
  'главная_default.png': 'home_default.png',
  'главная_open.png': 'home_open.png',
};

for (const oldName in filesToRename) {
  const newName = filesToRename[oldName];
  const oldPath = path.join(publicDir, oldName);
  const newPath = path.join(publicDir, newName);

  if (fs.existsSync(oldPath)) {
    try {
      fs.renameSync(oldPath, newPath);
      console.log(`Renamed "${oldName}" to "${newName}"`);
    } catch (e) {
      console.error(`Error renaming "${oldName}":`, e.message);
    }
  } else {
    console.warn(`File not found, skipping rename: "${oldPath}"`);
  }
}