#!/usr/bin/env node
/**
 * PWA Icon Generator
 * 
 * Place your source icon (at least 512x512, ideally square png) at:
 *  public/icons/source-icon.png
 * 
 * Then install the dependency and run:
 *  npm install --save-dev sharp
 *  node packages/web/generate-icons.js
 * 
 * This will generate all required PWA icons sizes into public/icons/
 * and also produce public/apple-touch-icon.png for iOS devices.
 * 
 * Note: This script uses the 'sharp' library for image processing, which is a native module.
 */

const path = require('path');
const fs = require('fs');

let sharp;
try {
    sharp = require('sharp');
} catch (e) {
    console.error("Error: 'sharp' module not found. Please install it with 'npm install --save-dev sharp'");
    process.exit(1);
}

const ICON_DIR = path.join(__dirname, 'public', 'icons');
// --- PLACEHOLDER: SOURCE_ICON_PATH ---
// Replace source-icon.png with the actual name of your source icon file
const SOURCE_ICON = path.join(ICON_DIR, 'source-icon.png');
// --- END PLACEHOLDER ---

if (!fs.existsSync(SOURCE_ICON)) {
    console.error(`Error: Source icon not found at ${SOURCE_ICON}`);
    console.error("Please place your source icon (at least 512x512, ideally square png) at the above path.");
    process.exit(1);
}

const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

if (!fs.existsSync(ICON_DIR)) {
    fs.mkdirSync(ICON_DIR, { recursive: true });
}

Promise.all(
    ICON_SIZES.map(size => 
        sharp(SOURCE_ICON)
            .resize(size, size)
            .toFile(path.join(ICON_DIR, `icon-${size}x${size}.png`))
            .then(() => console.log(`Generated icon-${size}x${size}.png`))
    )
).then(() => 
    // Generate apple-touch-icon.png (180x180)
    sharp(SOURCE_ICON)
        .resize(180, 180)
        .png()
        .toFile(path.join(__dirname, 'public', 'apple-touch-icon.png'))
)
.then(() => console.log('Generated apple-touch-icon.png (180x180)'))
.then(() => console.log('\nAll icons generated successfully!'))
.catch(err => {
    console.error('Error generating icons:', err);
    process.exit(1);
});
