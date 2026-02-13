document.addEventListener("DOMContentLoaded", () => {
  const domainEl = document.getElementById("domain") as HTMLInputElement | null;
  const apiKeyEl = document.getElementById("apiKey") as HTMLInputElement | null;
  const recipeEl = document.getElementById("recipeUrl") as HTMLInputElement | null;
  const statusEl = document.getElementById("status") as HTMLElement | null;

  const mainView = document.getElementById("mainView") as HTMLElement | null;
  const settingsView = document.getElementById("settingsView") as HTMLElement | null;
  const cogBtn = document.getElementById("cog") as HTMLButtonElement | null;
  const saveBtn = document.getElementById("save") as HTMLButtonElement | null;
  const backBtn = document.getElementById("back") as HTMLButtonElement | null;
  const importBtn = document.getElementById("import") as HTMLButtonElement | null;

  function showSettings() {
    if (mainView) mainView.style.display = "none";
    if (settingsView) settingsView.style.display = "block";
  }

  function showMain() {
    if (settingsView) settingsView.style.display = "none";
    if (mainView) mainView.style.display = "block";
  }

  chrome.storage.sync.get({ instanceDomain: "", apiKey: "" }, (res: any) => {
    if (domainEl) domainEl.value = res.instanceDomain || "";
    if (apiKeyEl) apiKeyEl.value = res.apiKey || "";
    // If either missing, open settings
    if (!res.instanceDomain || !res.apiKey) showSettings();
    else showMain();
  });

  // Autofill recipe URL with the current active tab URL if available
  try {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any) => {
      const url = tabs?.[0]?.url;
      if (url && recipeEl && !recipeEl.value) recipeEl.value = url;
    });
  } catch (e) {}

  cogBtn?.addEventListener("click", () => showSettings());
  backBtn?.addEventListener("click", () => showMain());

  saveBtn?.addEventListener("click", () => {
    const domain = domainEl?.value.trim() || "";
    const apiKey = apiKeyEl?.value.trim() || "";
    if (!domain || !apiKey) return alert("Please enter instance domain and API key");
    chrome.storage.sync.set({ instanceDomain: domain, apiKey }, () => {
      if (statusEl) statusEl.textContent = "Saved.";
      setTimeout(() => {
        if (statusEl) statusEl.textContent = "";
      }, 1500);
      showMain();
    });
  });

  importBtn?.addEventListener("click", () => {
    const recipeUrl = recipeEl?.value.trim() || "";
    if (!recipeUrl) return alert("Enter a recipe URL");
    if (statusEl) statusEl.textContent = "Importing...";
    chrome.runtime.sendMessage({ type: "import-recipe", recipeUrl });
  });

  chrome.runtime.onMessage.addListener((msg: any) => {
    if (msg.type === "import-result") {
      const id = msg.data?.recipeId;
      chrome.storage.sync.get(["instanceDomain"], (res: any) => {
        const rawDomain = res.instanceDomain || "";
        let domain = rawDomain.trim();
        if (domain && !/^https?:\/\//i.test(domain)) domain = `https://${domain}`;
        const link = id ? `${domain.replace(/\/$/, "")}/recipes/${id}` : null;

        if (!statusEl) return;
        statusEl.textContent = "";
        if (link) {
          const text = document.createTextNode("Import started. " );
          const a = document.createElement("a");
          a.href = link;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = "Open recipe (may not be ready)";
          statusEl.appendChild(text);
          statusEl.appendChild(a);
        } else if (id) {
          statusEl.textContent = `Import started. ID: ${id}`;
        } else {
          statusEl.textContent = "Import started.";
        }
      });
    }
    if (msg.type === "error") {
      if (statusEl) statusEl.textContent = "Error: " + msg.message;
    }
  });
});
