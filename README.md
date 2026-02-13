# Norish Quick Import

![version](https://img.shields.io/github/v/release/AfoxDesignz/norish-quick-import-extension?style=for-the-badge) ![license](https://img.shields.io/badge/license-MIT-yellow.svg?style=for-the-badge) [![Static Badge](https://img.shields.io/badge/available_for_chromium-555555?style=for-the-badge&logo=googlechrome&logoColor=white)](https://www.wikiwand.com/en/articles/Chromium_(web_browser))


Save recipes from any website into [Norish](https://github.com/norish-recipes/norish) in a couple of clicks while you browse.

### **Features**
- Small popup UI for quick actions
- Lightweight background worker for import interactions
- Built with TypeScript

> This extension is an independent project and is not an official browser extension nor affiliated with the [Norish](https://github.com/norish-recipes/norish) project.

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

>If you encounter any problem or have a question, feel free to create an issue.

---

### **Privacy**

Your Norish domain and API key are stored in Chrome sync storage (so they can sync with your browser profile). When you import a recipe, the extension sends the recipe URL and your API key only to the Norish instance you configured. The extension does not include analytics or third-party tracking.

---

### **Build from source**

1. Clone this repository:

```bash
git clone https://github.com/AfoxDesignz/norish-quick-import-extension.git
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
