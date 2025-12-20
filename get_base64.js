import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicDir = path.join(__dirname, 'public'); // Adjust if this script is not in murchat root

const filesToEncode = [
  'murchat.ico',
  'home_default.png',
  'home_open.png',
  'defaul_server_avatars.png',
  'open_server_avatars.png'
];

const mimeTypeMap = {
  'ico': 'image/x-icon',
  'png': 'image/png',
  // Add other types as needed
};

const encodedImages = {};

for (const file of filesToEncode) {
  try {
    const filePath = path.join(publicDir, file);
    const ext = path.extname(file).substring(1);
    const mime = mimeTypeMap[ext.toLowerCase()] || 'application/octet-stream';
    const base64 = fs.readFileSync(filePath).toString('base64');
    encodedImages[file] = `data:${mime};base64,${base64}`;
  } catch (e) {
    console.error(`Error encoding ${file}:`, e.message);
    encodedImages[file] = `error: ${e.message}`;
  }
}

console.log(JSON.stringify(encodedImages, null, 2));
