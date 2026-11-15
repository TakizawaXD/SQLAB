const fs = require('fs');
const path = require('path');

// 1. Read .env file from root if it exists
const envPath = path.resolve(__dirname, '../.env');
const envVars = {};

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.substring(0, idx).trim();
        const val = trimmed.substring(idx + 1).trim().replace(/^["']|["']$/g, '');
        envVars[key] = val;
      }
    }
  }
}

// 2. Merge with process.env (for CI/CD environments)
const finalConfig = {
  FIREBASE_API_KEY: process.env.FIREBASE_API_KEY || envVars.FIREBASE_API_KEY || '',
  FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN || envVars.FIREBASE_AUTH_DOMAIN || '',
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || envVars.FIREBASE_PROJECT_ID || '',
  FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET || envVars.FIREBASE_STORAGE_BUCKET || '',
  FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID || envVars.FIREBASE_MESSAGING_SENDER_ID || '',
  FIREBASE_APP_ID: process.env.FIREBASE_APP_ID || envVars.FIREBASE_APP_ID || '',
  APP_NAME: process.env.APP_NAME || envVars.APP_NAME || 'SQL LAB',
  APP_SLOGAN: process.env.APP_SLOGAN || envVars.APP_SLOGAN || 'Aprende. Ejecuta. Construye.',
  APP_VERSION: process.env.APP_VERSION || envVars.APP_VERSION || '1.0.0'
};

// 3. Write generated file for Angular
const fileContent = `// ==============================================================================
// ARCHIVO AUTOGENERADO A PARTIR DE .env MEDIANTE scripts/set-env.js
// NO EDITAR MANUALMENTE ESTE ARCHIVO.
// Para modificar credenciales o parámetros, edita el archivo .env en la raíz.
// ==============================================================================

export const firebaseConfig = {
  apiKey: "${finalConfig.FIREBASE_API_KEY}",
  authDomain: "${finalConfig.FIREBASE_AUTH_DOMAIN}",
  projectId: "${finalConfig.FIREBASE_PROJECT_ID}",
  storageBucket: "${finalConfig.FIREBASE_STORAGE_BUCKET}",
  messagingSenderId: "${finalConfig.FIREBASE_MESSAGING_SENDER_ID}",
  appId: "${finalConfig.FIREBASE_APP_ID}"
};

export const appEnvironment = {
  name: "${finalConfig.APP_NAME}",
  slogan: "${finalConfig.APP_SLOGAN}",
  version: "${finalConfig.APP_VERSION}"
};
`;

const targetDir = path.resolve(__dirname, '../src/app/core/config');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const targetPath = path.join(targetDir, 'firebase.config.ts');
fs.writeFileSync(targetPath, fileContent, 'utf8');

console.log('✓ Variables de entorno desde .env inyectadas correctamente en Angular.');
