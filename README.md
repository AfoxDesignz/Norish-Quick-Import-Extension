[![version](https://img.shields.io/github/v/release/AfoxDesignz/Norish-Quick-Import-Extension?style=for-the-badge&color=336640&labelColor=faf5e8)](https://github.com/AfoxDesignz/Norish-Quick-Import-Extension/releases) ![Visitors](https://api.visitorbadge.io/api/visitors?path=https%3A%2F%2Fgithub.com%2FAfoxDesignz%2Fnorish-quick-import-extension&labelColor=%23faf5e8&countColor=%23336640) ![license](https://img.shields.io/badge/license-MIT-336640.svg?style=for-the-badge&labelColor=faf5e8) [![Static Badge](https://img.shields.io/badge/built_for_chromium-336640?style=for-the-badge&logo=googlechrome&logoColor=336640&labelColor=faf5e8)](<https://www.wikiwand.com/en/articles/Chromium_(web_browser)>)

# Norish Quick Import

Save recipes from any website into [Norish](https://github.com/norish-recipes/norish) in a couple of clicks while you browse.

### **Features**

- Save recipes quickly: send the current page's recipe to your Norish instance in two clicks.
- Works on any site: import recipes from any webpage - no site-specific setup required.
- Simple setup: enter your Norish domain and API key once. The settings sync with your browser profile.
- Compact popup: a small, focused UI that keeps browsing uninterrupted.
- Privacy-first: only the page URL and your API key are sent to the Norish instance you configure.
- Lightweight: runs in the background with minimal permissions and low resource use.

**Planned improvements**

- Improve the popup UI.
- Clearer import status feedback.

> [!NOTE] 
> This extension is an independent project and is neither an official browser extension nor affiliated with the [Norish](https://github.com/norish-recipes/norish) project.

---

### **Quickstart**

Prebuilt releases include a ZIP of the compiled extension (contents of `dist/`). Read below if you want to build from source.

#### To install from a release:

1. Download and unzip the release ZIP.
2. Open Extensions in your Chromium-based browser -> enable Developer mode -> click **Load unpacked** -> select the unzipped folder.

#### After installation:

1. Open the Extensions menu (puzzle-piece icon) and pin "Norish Quick Import" to the extensions toolbar.
2. Go the the account settings of your [Norish](https://github.com/norish-recipes/norish) instance.
3. Create a new API key and copy it to your clipboard.
4. Click the extension icon in the extensions toolbar to open the Norish Quick Import popup.
5. Fillout the domain of your [Norish](https://github.com/norish-recipes/norish) instance and paste your API key.

After clicking on `save` you can just browse the internet and whenever you find a recipe, you would like to import into [Norish](https://github.com/norish-recipes/norish), just click the extension icon and hit send.

> [!TIP]
> If you encounter any problem or have a question, feel free to create an [issue](https://github.com/AfoxDesignz/Norish-Quick-Import-Extension/issues/new).

---

### **Privacy**

Your Norish domain and API key are stored in Chrome sync storage (so they can sync with your browser profile). When you import a recipe, the extension sends the recipe URL and your API key only to the Norish instance you configured. The extension does not include analytics or third-party tracking.

---

### **Build from source**

1. Clone this repository:

```bash
git clone https://github.com/AfoxDesignz/Norish-Quick-Import-Extension.git
```

2. Install dependencies:

```bash
pnpm install
```

3. Build (produces `dist/` and copies static files):

```bash
pnpm run build
```

4. Open Extensions in your Chromium-based browser -> enable Developer mode -> click **Load unpacked** -> select the `dist/` folder.

---

### **License**

- This repository is licensed under the MIT License. See the `LICENSE` file for details.

---
