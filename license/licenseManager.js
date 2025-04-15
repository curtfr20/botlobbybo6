const { BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const config = require('./config');

// Import des services modulaires
const ApiService = require('./modules/apiService');
const HardwareService = require('./modules/hardwareService');
const StorageService = require('./modules/storageService');
const GameModeService = require('./modules/gameModeService');
const EventService = require('./modules/eventService');
const LicenseValidator = require('./modules/licenseValidator');
const UpdateService = require('./modules/updateService');

/**
 * Gestionnaire de licence principal
 */
class LicenseManager {
  constructor(options = {}) {
    this.mainWindow = null;
    this.options = {
      licenseServerUrl: config.server.licenseValidation,
      activationServerUrl: config.server.licenseActivation,
      ...options
    };

    // Initialiser les services
    this.initializeServices();
    
    // Initialiser les écouteurs d'événements IPC
    this.initIPCListeners();
    
    this._log('Gestionnaire de licence initialisé');
  }

  /**
   * Log avec préfixe du nom du service
   * @private
   * @param {string} message - Message à logger
   */
  _log(message) {
    console.log(`[licenseManager] ${message}`);
  }

  /**
   * Log d'erreur avec préfixe du nom du service
   * @private
   * @param {string} message - Message d'erreur à logger
   * @param {Error} error - Objet d'erreur éventuel
   */
  _logError(message, error) {
    if (error) {
      console.error(`[licenseManager] ${message}`, error);
    } else {
      console.error(`[licenseManager] ${message}`);
    }
  }

  /**
   * Initialise les services modulaires
   */
  initializeServices() {
    // Service de stockage
    this.storageService = new StorageService();
    
    // Récupérer les données stockées
    const { licenseKey, hardwareId, licenseStatus } = this.storageService.getLicenseData();
    this.licenseKey = licenseKey;
    this.hardwareId = hardwareId;
    this.licenseStatus = licenseStatus;
    
    // Service d'identification matérielle
    this.hardwareService = new HardwareService();
    
    // Service d'événements
    this.eventService = new EventService(this.mainWindow);
    
    // Service API
    this.apiService = new ApiService(this.options);
    
    // Service de validation de licence
    this.licenseValidator = new LicenseValidator(this.apiService, this.eventService);
    
    // Service de gestion des modes de jeu
    this.gameModeService = new GameModeService(() => this.licenseStatus);

    // Service de gestion des mises à jour
    this.updateService = new UpdateService();
    
    this._log('Services initialisés');
  }

  /**
   * Affiche la fenêtre de vérification de licence
   * @returns {Promise<Object>} - Résultat de la vérification
   */
  async showLicenseWindow() {
    this._log('Ouverture de la fenêtre de vérification de licence');
    
    if (this.mainWindow) {
      this._log('Fermeture de la fenêtre existante');
      this.mainWindow.close();
      this.mainWindow = null;
    }
    
    // Variable pour suivre si l'utilisateur a explicitement validé la licence
    let userValidated = false;
    
    // Réinitialiser temporairement le statut de licence pour cette vérification
    const savedLicenseStatus = this.licenseStatus;
    this.licenseStatus = null;
    
    this._log('Création de la fenêtre de vérification');
    
    // Obtenir la configuration de la fenêtre
    const windowConfig = { 
      ...config.licenseWindow,
      webPreferences: {
        ...config.licenseWindow.webPreferences,
        preload: config.paths.licensePreload
      },
      icon: config.paths.appIcon
    };
    
    this.mainWindow = new BrowserWindow(windowConfig);

    // Mettre à jour le service d'événements avec la nouvelle fenêtre
    this.eventService.setMainWindow(this.mainWindow);

    await this.mainWindow.loadFile(config.paths.licenseView);
    this._log('Fenêtre de licence chargée');

    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show();
      this._log('Fenêtre de licence affichée');
    });

    // Créer un objet résultat par défaut pour les échecs
    const defaultResult = { 
      valid: false, 
      error: config.constants.licenseNotValidError 
    };

    return new Promise((resolve) => {
      // Les utilisateurs doivent explicitement valider leur licence
      ipcMain.once('license-validated', () => {
        this._log('Licence validée par l\'utilisateur, ouverture de BotLobby');
        // Marquer comme validé par l'utilisateur
        userValidated = true;
        
        // Utiliser le nouveau système modulaire
        try {
            const botLobby = require('../botlobby/modules'); // Ajuster le chemin si nécessaire
            const coordinator = botLobby.getBotLobbyCoordinator();

            if (coordinator) {
                 this._log('Coordinator found, creating BotLobby config window.');
                coordinator.createBotLobbyWindow(); // Ne passe plus parentWindow directement ici
            } else {
                 this._log('BotLobby Coordinator instance not found. Ensure it was initialized.');
                // Gérer l'erreur, peut-être afficher un message à l'utilisateur
                 dialog.showErrorBox('Erreur', 'Impossible de lancer BotLobby. Le coordinateur n\'a pas été initialisé.');
                // Rejeter la promesse ou retourner une erreur ?
                 // Pour l'instant, on ferme juste la fenêtre de licence
            }
        } catch (error) {
             this._logError('Failed to load or use BotLobbyCoordinator', error);
             dialog.showErrorBox('Erreur Critique', 'Impossible de charger le module BotLobby. Vérifiez les logs.');
             // Rejeter la promesse ou quitter ?
        }
        
        if (this.mainWindow) {
          this.mainWindow.close();
          this.mainWindow = null;
        }
        
        // Résoudre avec le statut de licence actuel (peut-être mis à jour par validation)
        // Il faut s'assurer que this.licenseStatus est bien le statut post-validation.
        // La logique de validation/activation met à jour this.licenseStatus.
        resolve(this.licenseStatus); 
      });
      
      this.mainWindow.on('closed', () => {
        this.mainWindow = null;
        
        // Si l'utilisateur n'a pas explicitement validé
        if (!userValidated) {
          // Reset du statut de licence et retour d'un objet non valide
          this.licenseStatus = null;
          this._log('Fenêtre fermée sans validation utilisateur, application non lancée');
          resolve(defaultResult);
        } else {
          // L'utilisateur a validé, on conserve le nouveau statut
          this._log('Fenêtre fermée après validation utilisateur, poursuite de l\'application');
          resolve(this.licenseStatus);
        }
      });
    });
  }

  /**
   * Initialise les écouteurs d'événements IPC
   */
  initIPCListeners() {
    this._log('Initialisation des écouteurs d\'événements IPC');
    
    // Ajout d'un gestionnaire pour le changement de langue
    ipcMain.handle('change-language', async (event, language) => {
      this._log(`Changement de langue demandé: ${language}`);
      try {
        // Mettre à jour la langue dans le service de mise à jour
        if (this.updateService) {
          await this.updateService.setLanguage(language);
        }
        return { success: true, language };
      } catch (error) {
        this._logError(`Erreur lors du changement de langue: ${language}`, error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('validate-license', async (event, licenseKey) => {
      this._log(`Demande de validation de licence reçue: ${licenseKey.substring(0, 4)}...`);
      const hardwareId = this.hardwareId || await this.getHardwareId();
      this.licenseKey = licenseKey;
      
      // Sauvegarder la clé de licence
      this.storageService.saveLicenseKey(licenseKey);
      
      // Vérifier si c'est la première utilisation ou utilisation ultérieure
      let licenseResult;
      if (!this.licenseStatus || !this.licenseStatus.valid) {
        this._log('Première utilisation ou licence invalide, activation en cours');
        licenseResult = await this.activateLicense(licenseKey, hardwareId);
      } else {
        this._log('Licence déjà activée, validation en cours');
        licenseResult = await this.validateLicense(licenseKey, hardwareId);
      }
      
      return licenseResult;
    });

    ipcMain.handle('get-license-status', () => {
      this._log('Demande de statut de licence reçue');
      return this.licenseStatus;
    });

    ipcMain.handle('get-saved-license', () => {
      this._log('Demande de licence sauvegardée reçue');
      return this.licenseKey;
    });

    ipcMain.handle('get-hardware-id', async () => {
      this._log('Demande d\'ID matériel reçue');
      return this.hardwareId || await this.getHardwareId();
    });

    ipcMain.handle('get-activation-date', () => {
      this._log('Demande de date d\'activation reçue');
      return this.licenseStatus ? this.licenseStatus.activationDate : null;
    });
    
    // Gestionnaires pour les modes de jeu
    ipcMain.handle('is-game-mode-available', (event, mode) => {
      this._log(`Vérification de disponibilité du mode de jeu: ${mode}`);
      return this.gameModeService.isGameModeAvailable(mode);
    });
    
    ipcMain.handle('get-available-game-modes', () => {
      this._log('Demande des modes de jeu disponibles');
      return this.gameModeService.getAvailableGameModes();
    });

    // Gestionnaire pour les mises à jour - Utilisation du service UpdateService
    ipcMain.handle('check-for-updates', async () => {
      try {
        this._log('Demande de vérification des mises à jour');
        return await this.updateService.checkForUpdates(false, false);
      } catch (error) {
        this._logError('Erreur lors de la vérification des mises à jour:', error);
        throw error;
      }
    });

    ipcMain.handle('get-version-history', async (event, limit = 5) => {
      try {
        this._log('Demande de récupération de l\'historique des versions');
        return await this.updateService.getVersionHistory(limit);
      } catch (error) {
        this._logError('Erreur lors de la récupération de l\'historique des versions:', error);
        return { 
          success: false, 
          message: `Erreur: ${error.message}`,
          versions: [],
          currentVersion: require('electron').app.getVersion()
        };
      }
    });

    ipcMain.handle('download-update', async (event, updateInfo) => {
      try {
        this._log('Demande de téléchargement de mise à jour reçue');
        return await this.updateService.downloadUpdate(updateInfo);
      } catch (error) {
        this._logError('Erreur lors du téléchargement de la mise à jour:', error);
        throw error;
      }
    });

    ipcMain.handle('clear-license', () => {
      this._log('Demande d\'effacement des données de licence reçue');
      this.licenseKey = null;
      this.licenseStatus = null;
      this.storageService.clearLicenseData();
      return true;
    });
    
    ipcMain.handle('open-external-link', async (event, url) => {
      try {
        this._log(`Ouverture d'un lien externe: ${url}`);
        const { shell } = require('electron');
        await shell.openExternal(url);
        return true;
      } catch (error) {
        this._logError('Erreur lors de l\'ouverture du lien externe:', error);
        return false;
      }
    });

    ipcMain.on('quit-app', () => {
      this._log('Demande de quitter l\'application reçue');
      require('electron').app.quit();
    });
  }

  /**
   * Récupère ou génère l'identifiant matériel
   * @returns {Promise<string>} - L'identifiant matériel
   */
  async getHardwareId() {
    if (this.hardwareId) {
      this._log(`Utilisation de l'ID matériel existant: ${this.hardwareId.substring(0, 8)}...`);
      return this.hardwareId;
    }
    
    this._log('Génération d\'un nouvel ID matériel');
    this.hardwareId = await this.hardwareService.generateHardwareId();
    this.storageService.saveHardwareId(this.hardwareId);
    
    return this.hardwareId;
  }

  /**
   * Active une licence
   * @param {string} licenseKey - Clé de licence à activer
   * @param {string} hardwareId - ID matériel
   * @returns {Promise<Object>} - Statut de licence
   */
  async activateLicense(licenseKey, hardwareId) {
    this._log(`Activation de la licence: ${licenseKey.substring(0, 4)}...`);
    const licenseStatus = await this.licenseValidator.activateLicense(
        licenseKey,
        hardwareId,
      this.licenseStatus
    );
    
    this.licenseStatus = licenseStatus;
    this.storageService.saveLicenseStatus(licenseStatus);
    
    const status = licenseStatus.valid ? 'réussie' : 'échouée';
    this._log(`Activation de licence ${status}`);
    
    return licenseStatus;
  }

  /**
   * Valide une licence existante
   * @param {string} licenseKey - Clé de licence à valider
   * @param {string} hardwareId - ID matériel
   * @returns {Promise<Object>} - Statut de licence
   */
  async validateLicense(licenseKey, hardwareId) {
    this._log(`Validation de la licence: ${licenseKey.substring(0, 4)}...`);
    const licenseStatus = await this.licenseValidator.validateLicense(licenseKey, hardwareId);
    
    this.licenseStatus = licenseStatus;
    this.storageService.saveLicenseStatus(licenseStatus);
    
    const status = licenseStatus.valid ? 'réussie' : 'échouée';
    this._log(`Validation de licence ${status}`);
    
    return licenseStatus;
  }
}

module.exports = LicenseManager; 