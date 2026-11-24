import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const host = "127.0.0.1";
const serverPort = 8766;
const debugPort = 9224;
const externalUrl = process.env.QA_URL || "";
const url = externalUrl || `http://${host}:${serverPort}/`;
const outputDir = path.join(root, "tmp", "qa");
fs.mkdirSync(outputDir, { recursive: true });

const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const chromePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
if (!chromePath) throw new Error("Chrome or Edge was not found. Set CHROME_PATH and retry.");

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function httpGet(targetUrl) {
  return new Promise((resolve, reject) => {
    const client = targetUrl.startsWith("https:") ? https : http;
    const request = client.get(targetUrl, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => resolve({ statusCode: response.statusCode, body }));
    });
    request.setTimeout(2_000, () => request.destroy(new Error("HTTP request timed out")));
    request.on("error", reject);
  });
}

async function waitForUrl(targetUrl, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await httpGet(targetUrl);
      if (response.statusCode >= 200 && response.statusCode < 300) return response;
    } catch {
      // Retry while the local process starts.
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${targetUrl}`);
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
        return;
      }
      (this.events.get(message.method) || []).forEach((handler) => handler(message.params));
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 10_000);
    });
  }

  on(method, handler) {
    const handlers = this.events.get(method) || [];
    handlers.push(handler);
    this.events.set(method, handlers);
  }
}

const server = externalUrl
  ? null
  : spawn("python", ["-m", "http.server", String(serverPort), "--bind", host], {
      cwd: root,
      stdio: "ignore",
      windowsHide: true,
    });

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-anatomy-chrome-"));
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--enable-unsafe-swiftshader",
    "--proxy-server=direct://",
    "--proxy-bypass-list=*",
    "--disable-extensions",
    "--disable-background-networking",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${debugPort}`,
    "--remote-debugging-address=127.0.0.1",
    "--remote-allow-origins=*",
    `--user-data-dir=${profileDir}`,
    url,
  ],
  { stdio: "ignore", windowsHide: true },
);

let socket;
try {
  await waitForUrl(url);
  await waitForUrl(`http://127.0.0.1:${debugPort}/json/version`);
  const targetsResponse = await httpGet(`http://127.0.0.1:${debugPort}/json/list`);
  const target = JSON.parse(targetsResponse.body).find((item) => item.type === "page");
  if (!target) throw new Error("No browser page target found.");

  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  const cdp = new CdpClient(socket);
  const browserErrors = [];
  cdp.on("Runtime.exceptionThrown", (event) => browserErrors.push(event.exceptionDetails.text));
  cdp.on("Log.entryAdded", (event) => {
    if (event.entry.level === "error") browserErrors.push(event.entry.text);
  });
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");

  const viewports = [
    { name: "desktop", width: 1440, height: 1000, mobile: false },
    { name: "tablet", width: 768, height: 900, mobile: true },
    { name: "mobile", width: 390, height: 844, mobile: true },
  ];

  for (const viewport of viewports) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.mobile,
    });
    await cdp.send("Page.navigate", { url });
    await sleep(800);

    const evaluation = await cdp.send("Runtime.evaluate", {
      returnByValue: true,
      awaitPromise: true,
      expression: `(() => {
        const canvas = document.querySelector("#portfolio-canvas");
        const fallback = document.querySelector("#webgl-fallback");
        return {
          title: document.title,
          lang: document.documentElement.lang,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          h1Count: document.querySelectorAll("h1").length,
          workbenchCount: document.querySelectorAll("main > section").length,
          assetCount: document.querySelectorAll("[data-asset-id]").length,
          barRows: document.querySelectorAll(".bar-row").length,
          brokenImages: [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).length,
          hiddenMetrics: [...document.querySelectorAll("[id^='selected-']:not(#selected-swatch)")]
            .filter((node) => !node.textContent.trim()).length,
          canvasWidth: Math.round(canvas.getBoundingClientRect().width),
          canvasHeight: Math.round(canvas.getBoundingClientRect().height),
          canvasHidden: canvas.hidden,
          fallbackHidden: fallback.hidden,
          ytdValue: document.querySelector("#kpi-ytd").textContent,
          volatilityValue: document.querySelector("#kpi-vol").textContent,
          windowValue: document.querySelector("#kpi-window").textContent
        };
      })()`,
    });
    const metrics = evaluation.result.value;
    const label = `portfolio/${viewport.name}`;
    if (metrics.lang !== "en") throw new Error(`${label}: expected English page language`);
    if (metrics.scrollWidth > metrics.clientWidth + 1) {
      throw new Error(`${label}: horizontal overflow (${metrics.scrollWidth}px > ${metrics.clientWidth}px)`);
    }
    if (metrics.h1Count !== 1) throw new Error(`${label}: expected one h1`);
    if (metrics.workbenchCount !== 4) throw new Error(`${label}: expected four main sections`);
    if (metrics.assetCount !== 8) throw new Error(`${label}: expected eight asset controls`);
    if (metrics.barRows !== 32) throw new Error(`${label}: expected 32 diagnostic bars, found ${metrics.barRows}`);
    if (metrics.brokenImages) throw new Error(`${label}: found ${metrics.brokenImages} broken images`);
    if (metrics.hiddenMetrics) throw new Error(`${label}: found ${metrics.hiddenMetrics} empty inspector metrics`);
    if (metrics.canvasWidth < (viewport.mobile ? 300 : 500) || metrics.canvasHeight < 400) {
      throw new Error(`${label}: 3D stage is too small`);
    }
    if (metrics.canvasHidden && metrics.fallbackHidden) {
      throw new Error(`${label}: neither WebGL nor fallback is visible`);
    }

    if (viewport.name === "desktop") {
      const interaction = await cdp.send("Runtime.evaluate", {
        returnByValue: true,
        awaitPromise: true,
        expression: `(async () => {
          document.querySelector('[data-view-mode="returns"]').click();
          for (const mode of ["drawdown", "volatility", "growth", "returns"]) {
            document.querySelector('[data-view-mode="' + mode + '"]').click();
            await new Promise((resolve) => setTimeout(resolve, 40));
          }
          document.querySelector('[data-scenario="rates"]').click();
          document.querySelector('[data-range="36"]').click();
          document.querySelector('[data-asset-id="VEA"]').click();
          document.querySelector("#play-button").click();
          await new Promise((resolve) => setTimeout(resolve, 250));
          return {
            mode: document.querySelector("#view-title").textContent,
            selected: document.querySelector("#selected-name").textContent,
            windowReturn: document.querySelector("#kpi-window").textContent,
            rangePressed: document.querySelector('[data-range="36"]').getAttribute("aria-pressed"),
            playing: document.querySelector("#play-button").textContent,
            weight: document.querySelector('[data-asset-id="VEA"] strong').textContent,
            latestReturn: document.querySelector("#selected-return-month").textContent
          };
        })()`,
      });
      const value = interaction.result.value;
      if (!/market gained/i.test(value.mode)) throw new Error(`Return view did not activate: ${JSON.stringify(value)}`);
      if (!/developed/i.test(value.selected)) throw new Error(`Asset selection did not update: ${JSON.stringify(value)}`);
      if (!/^[−-]/.test(value.windowReturn)) throw new Error(`Scenario return did not update: ${JSON.stringify(value)}`);
      if (value.rangePressed !== "true") throw new Error(`Time window did not activate: ${JSON.stringify(value)}`);
      if (!/pause/i.test(value.playing)) throw new Error(`History playback did not start: ${JSON.stringify(value)}`);
      if (!/^[+−-]/.test(value.weight)) {
        throw new Error(`Monthly return readout did not update: ${JSON.stringify(value)}`);
      }
      if (!/^[+−-]/.test(value.latestReturn)) {
        throw new Error(`Selected asset return did not update: ${JSON.stringify(value)}`);
      }
    }

    const screenshot = await cdp.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    fs.writeFileSync(
      path.join(outputDir, `portfolio-${viewport.name}.png`),
      Buffer.from(screenshot.data, "base64"),
    );
  }

  if (browserErrors.length) throw new Error(`Browser errors: ${browserErrors.join(" | ")}`);
  console.log(JSON.stringify({ passed: true, pages: viewports.length }, null, 2));
} finally {
  socket?.close();
  chrome.kill();
  server?.kill();
}
