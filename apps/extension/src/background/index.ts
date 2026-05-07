const BACKEND_HTTP_ORIGIN = "http://127.0.0.1:3777";
const USACO_IDE_HOME = "https://ide.usaco.guide/";
const USACO_IDE_URL = /^https:\/\/ide\.usaco\.guide(?:\/|$)/i;

interface BackendProxyRequest {
  type: "USACO_HELPER_BACKEND_REQUEST";
  path: string;
  init?: {
    body?: string;
    headers?: Record<string, string>;
    method?: string;
  };
}

interface BackendProxyResponse {
  body: string;
  error?: string;
  ok: boolean;
  status: number;
  statusText: string;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    helperMode: "practice"
  });
});

chrome.action.onClicked.addListener((tab) => {
  void openOrInjectHelper(tab);
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isBackendProxyRequest(message)) {
    return false;
  }

  void proxyBackendRequest(message)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        body: "",
        error: readErrorMessage(error),
        ok: false,
        status: 0,
        statusText: ""
      } satisfies BackendProxyResponse);
    });

  return true;
});

async function proxyBackendRequest(message: BackendProxyRequest): Promise<BackendProxyResponse> {
  const response = await fetch(`${BACKEND_HTTP_ORIGIN}${message.path}`, {
    body: message.init?.body,
    headers: message.init?.headers,
    method: message.init?.method ?? "GET"
  });

  return {
    body: await response.text(),
    ok: response.ok,
    status: response.status,
    statusText: response.statusText
  };
}

function isBackendProxyRequest(value: unknown): value is BackendProxyRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<BackendProxyRequest>;
  return candidate.type === "USACO_HELPER_BACKEND_REQUEST"
    && typeof candidate.path === "string"
    && candidate.path.startsWith("/");
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : "Local backend is not reachable.";
}

async function openOrInjectHelper(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id !== undefined && tab.url && USACO_IDE_URL.test(tab.url)) {
    await chrome.scripting.executeScript({
      files: ["content.js"],
      target: { tabId: tab.id }
    });
    return;
  }

  await chrome.tabs.create({ url: USACO_IDE_HOME });
}
