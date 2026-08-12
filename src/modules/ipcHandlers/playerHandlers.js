// modules/ipcHandlers/playerHandlers.js
const { ipcMain } = require("electron");
const playerFinder = require("../playerFinder");
const { getMainWindow } = require("../windowManager");
const torsherPlayerManager = require("../torsherPlayerManager");

function registerPlayerHandlers() {
  torsherPlayerManager.setMainWindowProvider(getMainWindow);
  // Получить все плееры
  ipcMain.handle("player-get-all", async () => {
    return await playerFinder.getAllPlayers();
  });

  // Получить плеер по умолчанию
  ipcMain.handle("player-get-default", async () => {
    return await playerFinder.getDefaultPlayer();
  });

  // Установить плеер по умолчанию
  ipcMain.handle("player-set-default", async (event, playerId) => {
    const success = await playerFinder.setDefaultPlayer(playerId);
    if (success) {
      const mainWindow = getMainWindow();
      await playerFinder.saveToLocalStorage(mainWindow);
    }
    return success;
  });

  // Найти конкретный плеер
  ipcMain.handle("player-find", async (event, playerId) => {
    return await playerFinder.findPlayer(playerId);
  });

  // Найти все плееры
  ipcMain.handle("player-find-all", async () => {
    return await playerFinder.findAllPlayers();
  });

  // Диалог выбора вручную
  ipcMain.handle("player-select-manual", async () => {
    const mainWindow = getMainWindow();
    const path = await playerFinder.showManualSelectDialog(mainWindow);
    if (path) {
      await playerFinder.saveToLocalStorage(mainWindow, path);
    }
    return path;
  });

  // Сохранить путь в localStorage
  ipcMain.handle("player-save-path", async (event, playerPath) => {
    const mainWindow = getMainWindow();
    return await playerFinder.saveToLocalStorage(mainWindow, playerPath);
  });

  // Получить список доступных плееров
  ipcMain.handle("player-get-available", async () => {
    return playerFinder.getAvailablePlayersList();
  });
  ipcMain.handle("player-get-all-with-details", async () => {
    const players = await playerFinder.getAllPlayers();
    const defaultPlayer = await playerFinder.getDefaultPlayer();

    return {
      success: true,
      players: players.map((player) => ({
        id: player.id,
        name: player.name,
        description: player.description,
        path: player.path,
        isDefault: defaultPlayer ? player.id === defaultPlayer.id : false,
      })),
    };
  });

  // Установить плеер по умолчанию и сразу сохранить в localStorage
  ipcMain.handle("player-set-default-and-save", async (event, playerId) => {
    const mainWindow = getMainWindow();
    if (playerId === "torsherplayer") {
      let player = await playerFinder.findPlayer(playerId);
      if (!player) {
        const selectedPath =
          await playerFinder.showTorsherPlayerSelectDialog(mainWindow);
        if (!selectedPath) return { success: false, canceled: true };
        if (!playerFinder.setTorsherPlayerPath(selectedPath)) {
          return { success: false, invalidPath: true };
        }
      }
    }
    const success = await playerFinder.setDefaultPlayer(playerId);

    if (success) {
      // Сохраняем в localStorage Lampa
      const saved = await playerFinder.saveToLocalStorage(mainWindow);
      return { success: true, saved };
    }

    return { success: false };
  });

  ipcMain.handle("torsherplayer-launch", async (event, media) => {
    if (media?.playerPath) {
      const saved = playerFinder.setTorsherPlayerPath(media.playerPath);
      if (!saved) {
        throw new Error(`TorsherPlayer не найден: ${media.playerPath}`);
      }
    }
    const player = await playerFinder.getDefaultPlayer();
    if (!player || player.id !== "torsherplayer") {
      throw new Error("TorsherPlayer не выбран в настройках");
    }
    return await torsherPlayerManager.launch(player.path, media);
  });
}

module.exports = registerPlayerHandlers;
