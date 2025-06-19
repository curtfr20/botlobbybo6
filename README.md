# Multi-View Browser

Une application Electron permettant de créer et gérer plusieurs vues de navigateur (BrowserViews) avec synchronisation de défilement.

## Fonctionnalités

- Fenêtre de sélection avec interface moderne et animations d'étoiles filantes
- Configuration du mode de jeu (multiplayer: 5 vues par ligne, warzone: 4 vues par ligne)
- Sélection du nombre de vues (1-44)
- Création de BrowserViews avec disposition adaptative
- Défilement synchronisé entre toutes les vues
- Sessions de navigateur indépendantes pour chaque vue

## Prérequis

- Node.js (v14+)
- npm ou yarn

## Installation

1. Clonez ce dépôt
2. Installez les dépendances :

```bash
npm install
```

## Utilisation

Pour démarrer l'application en mode développement :

```bash
npm run dev
```

Pour démarrer l'application en mode production :

```bash
npm start
```

## Structure du projet

```
├── src/
│   ├── main/           # Processus principal (Electron)
│   │   ├── main.js     # Point d'entrée
│   │   ├── selectionWindow.js  # Fenêtre de sélection
│   │   ├── mainViewWindow.js   # Fenêtre principale avec BrowserViews
│   │   ├── preload.js  # Script de préchargement pour IPC
│   │   └── viewPreload.js # Préchargement pour les BrowserViews
│   │
│   └── renderer/       # Processus de rendu (UI)
│       ├── css/        # Styles CSS
│       ├── js/         # Scripts JavaScript
│       ├── assets/     # Images et ressources
│       ├── selection.html  # Page de sélection
│       └── main.html   # Page principale
│
├── package.json
└── README.md
```

## Personnalisation

- Modifier les pages HTML dans `src/renderer/`
- Personnaliser les styles dans `src/renderer/css/`
- Ajouter des fonctionnalités dans les scripts JS

## Licence

Licence Creative Commons CC BY-NC-ND (Attribution – Non Commercial – No Derivatives)
