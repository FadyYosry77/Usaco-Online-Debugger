import { createRoot } from "react-dom/client";
import { PANEL_ROOT_ID } from "../lib/constants";
import { UsacoPageAdapter } from "../lib/pageAdapter";
import { HelperPanel } from "../ui/HelperPanel";
import helperStyles from "../ui/styles.css?inline";

const MOUNT_RETRY_DELAY_MS = 250;
const MOUNT_RETRY_ATTEMPTS = 20;

function injectBridge(): Promise<void> {
  if (document.querySelector("script[data-usaco-helper-bridge='true']")) {
    return Promise.resolve();
  }

  const script = document.createElement("script");
  script.dataset.usacoHelperBridge = "true";
  script.src = chrome.runtime.getURL("injectedBridge.js");
  script.async = false;
  const loaded = new Promise<void>((resolve) => {
    script.onload = () => {
      script.remove();
      resolve();
    };
    script.onerror = () => resolve();
    window.setTimeout(resolve, 1000);
  });
  document.documentElement.appendChild(script);
  return loaded;
}

function injectStyles() {
  if (document.getElementById("usaco-helper-style")) {
    return;
  }
  if (!document.head) {
    throw new Error("USACO Local Debug Helper could not find document.head for style injection.");
  }
  const style = document.createElement("style");
  style.id = "usaco-helper-style";
  style.textContent = helperStyles;
  document.head.appendChild(style);
}

async function mount(attempt = 0): Promise<void> {
  if (!document.body || !document.documentElement) {
    if (attempt >= MOUNT_RETRY_ATTEMPTS) {
      console.warn("[USACO Helper] Could not mount because the page body is unavailable.");
      return;
    }

    window.setTimeout(() => {
      void mount(attempt + 1);
    }, MOUNT_RETRY_DELAY_MS);
    return;
  }

  const adapter = new UsacoPageAdapter();
  if (!adapter.isSupportedPage()) {
    return;
  }

  if (document.getElementById(PANEL_ROOT_ID)) {
    return;
  }

  await injectBridge();
  injectStyles();

  const host = document.createElement("div");
  host.id = PANEL_ROOT_ID;
  host.className = "usaco-helper-host";
  document.body.appendChild(host);

  createRoot(host).render(<HelperPanel adapter={adapter} hostElement={host} />);
  console.info("[USACO Helper] Local Debug Helper panel mounted.");
}

void mount().catch((error) => {
  console.error("[USACO Helper] Could not mount Local Debug Helper panel.", error);
});
