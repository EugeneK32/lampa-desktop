const { spawn } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const { existsSync } = require("node:fs");
const http = require("node:http");

const CALLBACK_HOST = "127.0.0.1";
const CALLBACK_PORT = 19777;
const CALLBACK_PATH = "/torsherplayer/event";
const MAX_BODY_SIZE = 1024 * 1024;

class TorsherPlayerManager {
  constructor() {
    this.server = null;
    this.serverPromise = null;
    this.callbackToken = randomBytes(24).toString("hex");
    this.mainWindowProvider = null;
  }

  setMainWindowProvider(provider) {
    this.mainWindowProvider = provider;
  }

  sendEvent(payload) {
    const mainWindow = this.mainWindowProvider?.();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("torsherplayer-event", payload);
    }
  }

  startCallbackServer() {
    if (this.server) return Promise.resolve();
    if (this.serverPromise) return this.serverPromise;

    this.serverPromise = new Promise((resolve, reject) => {
      const server = http.createServer((request, response) => {
        if (request.method !== "POST" || request.url !== CALLBACK_PATH) {
          response.writeHead(404).end();
          return;
        }

        if (request.headers.authorization !== `Bearer ${this.callbackToken}`) {
          response.writeHead(401).end();
          return;
        }

        let body = "";
        request.setEncoding("utf8");
        request.on("data", (chunk) => {
          body += chunk;
          if (body.length > MAX_BODY_SIZE) request.destroy();
        });
        request.on("end", () => {
          try {
            const payload = JSON.parse(body);
            response.writeHead(204).end();
            this.sendEvent(payload);
          } catch {
            response.writeHead(400).end();
          }
        });
      });

      server.once("error", (error) => {
        this.serverPromise = null;
        reject(error);
      });
      server.listen(CALLBACK_PORT, CALLBACK_HOST, () => {
        this.server = server;
        this.serverPromise = null;
        resolve();
      });
    });

    return this.serverPromise;
  }

  async launch(playerPath, media) {
    if (!playerPath || !existsSync(playerPath)) {
      throw new Error(
        `TorsherPlayer не найден: ${playerPath || "путь не задан"}`,
      );
    }
    if (!media?.url || !media?.mediaKey) {
      throw new Error(
        "Не удалось сформировать URL или media-key для TorsherPlayer",
      );
    }

    await this.startCallbackServer();

    const args = [
      "--url",
      media.url,
      "--media-key",
      media.mediaKey,
      "--title",
      media.title || "Lampa",
      "--resume",
      String(Math.max(0, Number(media.resume) || 0)),
      "--callback",
      `http://${CALLBACK_HOST}:${CALLBACK_PORT}${CALLBACK_PATH}`,
      "--callback-token",
      this.callbackToken,
    ];

    const playerProcess = spawn(playerPath, args, {
      stdio: "ignore",
      windowsHide: false,
    });

    playerProcess.once("error", (error) => {
      this.sendEvent({
        version: 1,
        event: "error",
        mediaKey: media.mediaKey,
        title: media.title,
        message: error.message,
      });
    });
    playerProcess.unref();

    return { success: true, pid: playerProcess.pid };
  }

  close() {
    this.server?.close();
    this.server = null;
    this.serverPromise = null;
  }
}

module.exports = new TorsherPlayerManager();
