const g = globalThis as {
  browser?: { runtime?: { id?: string } };
  chrome?: { runtime?: { id?: string } };
};

const NON_EXTENSION_STUB_ID = "__non_extension_stub__";

export const IS_EXTENSION_ENV = Boolean(
  (g.browser?.runtime?.id && g.browser.runtime.id !== NON_EXTENSION_STUB_ID) ||
  (g.chrome?.runtime?.id && g.chrome.runtime.id !== NON_EXTENSION_STUB_ID),
);

if (!IS_EXTENSION_ENV) {
  const stub = { runtime: { id: NON_EXTENSION_STUB_ID } };
  if (!g.chrome?.runtime?.id) g.chrome = stub;
  if (!g.browser?.runtime?.id) g.browser = stub;
}
