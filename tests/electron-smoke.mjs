import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { app, Menu } from "electron";
import sharp from "sharp";

const profile = mkdtempSync(path.join(tmpdir(), "elecwhat-smoke-"));
app.setPath("userData", profile);
app.commandLine.appendSwitch("ozone-platform", "x11");
app.disableHardwareAcceleration();
writeFileSync(
  path.join(profile, "config.json"),
  JSON.stringify({
    dbus: false,
    "register-url-scheme": false,
    spellcheck: false,
    "spellcheck-languages": [],
    "show-at-startup": false,
    url: "data:text/html,<script>window.importDefault = () => () => {};</script><textarea>Test</textarea>",
  }),
);

const watchdog = setTimeout(() => {
  console.error("Electron smoke test timed out");
  app.exit(1);
}, 20000);
app.on("quit", () => {
  clearTimeout(watchdog);
  rmSync(profile, { recursive: true, force: true });
});

async function smoke() {
  try {
    await app.whenReady();
    const created = once(app, "browser-window-created");
    await import("../src/main.mjs");
    const [, window] = await created;
    await once(window.webContents, "did-finish-load");
    assert.ok(window.webContents.listenerCount("context-menu") > 0);
    let menu;
    const originalPopup = Menu.prototype.popup;
    Menu.prototype.popup = function () {
      menu = this;
    };
    try {
      window.webContents.emit(
        "context-menu",
        {},
        {
          selectionText: "Test",
          misspelledWord: "",
          dictionarySuggestions: [],
          editFlags: { canCopy: true, canCut: true, canPaste: true },
          isEditable: true,
          mediaType: "none",
          linkURL: "",
        },
      );
      assert.equal(menu.getMenuItemById("copy").enabled, true);
    } finally {
      Menu.prototype.popup = originalPopup;
    }
    const keys = await window.webContents.executeJavaScript('window.ipc.stateGet("keys")');
    assert.equal(keys["C Tab"].whatsappAction, "GO_TO_NEXT_CHAT");
    assert.equal(await window.webContents.executeJavaScript("typeof ewCloseChat"), "function");

    const webp = await sharp({ create: { width: 16, height: 16, channels: 4, background: "green" } })
      .webp()
      .toBuffer();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(webp, { headers: { "content-type": "image/webp" } });
    try {
      const { getIcon } = await import("../src/util.mjs");
      const icon = await getIcon("https://web.whatsapp.com/smoke.webp", { iconsDir: profile, userAgent: "smoke-test" });
      assert.deepEqual(icon.getSize(), { width: 16, height: 16 });
    } finally {
      globalThis.fetch = originalFetch;
    }

    window.show();
    window.hide();
    await window.webContents.executeJavaScript("Promise.resolve()");
    console.log(
      `Electron ${process.versions.electron}: startup, preload IPC, context menu, tray and WebP icons passed`,
    );
    app.quit();
  } catch (err) {
    console.error(err);
    app.exit(1);
  }
}

void smoke();
