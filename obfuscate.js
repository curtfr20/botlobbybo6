const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');
const glob = require('glob');

// Configuration d'obfuscation
const obfuscationOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.7,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: true,
  debugProtectionInterval: true,
  disableConsoleOutput: true,
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  numbersToExpressions: true,
  renameGlobals: false,
  selfDefending: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 10,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayEncoding: ['base64'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 4,
  stringArrayWrappersType: 'function',
  stringArrayThreshold: 0.75,
  transformObjectKeys: true,
  unicodeEscapeSequence: false
};

// Répertoires à obfusquer
const directories = [
  './src/main',
  './src/license'
];

// Répertoire temporaire pour les fichiers obfusqués
const outputDir = './dist-temp';

// Créer le répertoire temporaire s'il n'existe pas
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Fonction pour obfusquer un fichier
function obfuscateFile(filePath) {
  try {
    const code = fs.readFileSync(filePath, 'utf8');
    
    // Ne pas obfusquer les fichiers preload pour éviter les problèmes avec contextBridge
    const isPreload = filePath.includes('Preload') || filePath.includes('preload');
    
    // Obfusquer le code avec des options différentes selon le type de fichier
    const obfuscatedCode = isPreload 
      ? JavaScriptObfuscator.obfuscate(code, {
          compact: true,
          renameGlobals: false,
          stringArray: false,
          selfDefending: false
        }).getObfuscatedCode()
      : JavaScriptObfuscator.obfuscate(code, obfuscationOptions).getObfuscatedCode();
    
    // Déterminer le chemin de sortie (même structure que l'original)
    const relativePath = path.relative('.', filePath);
    const outputPath = path.join(outputDir, relativePath);
    
    // Créer le répertoire parent s'il n'existe pas
    const parentDir = path.dirname(outputPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    
    // Écrire le fichier obfusqué
    fs.writeFileSync(outputPath, obfuscatedCode);
    console.log(`Obfusqué: ${filePath} -> ${outputPath}`);
    
  } catch (error) {
    console.error(`Erreur lors de l'obfuscation de ${filePath}:`, error);
  }
}

// Obfusquer tous les fichiers JavaScript dans les répertoires spécifiés
directories.forEach(dir => {
  const files = glob.sync(`${dir}/**/*.js`);
  files.forEach(obfuscateFile);
});

// Copier les fichiers obfusqués vers les répertoires d'origine
function copyObfuscatedFiles(directory) {
  const tempDir = path.join(outputDir, directory);
  if (fs.existsSync(tempDir)) {
    const files = glob.sync(`${tempDir}/**/*.js`);
    files.forEach(file => {
      const relativePath = path.relative(tempDir, file);
      const destPath = path.join(directory, relativePath);
      fs.copyFileSync(file, destPath);
      console.log(`Copié: ${file} -> ${destPath}`);
    });
  }
}

directories.forEach(dir => {
  copyObfuscatedFiles(dir);
});

console.log('Obfuscation terminée.'); 