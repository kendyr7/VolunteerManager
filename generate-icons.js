const sharp = require('sharp');
const path = require('path');

async function createIcons() {
  const iconPath = path.join(__dirname, 'public', 'icon-192.png');
  
  // Create a 192x192 black background version
  await sharp(iconPath)
    .flatten({ background: '#000000' })
    .toFile(path.join(__dirname, 'public', 'app-icon-192.png'));

  // Create a 512x512 black background version
  await sharp(iconPath)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .flatten({ background: '#000000' })
    .toFile(path.join(__dirname, 'public', 'app-icon-512.png'));
  
  console.log('Icons generated successfully.');
}

createIcons().catch(console.error);
