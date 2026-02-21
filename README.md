[![version](https://img.shields.io/github/v/release/AfoxDesignz/Norish-Quick-Import-Extension?style=for-the-badge&color=336640&labelColor=faf5e8)](https://github.com/AfoxDesignz/Norish-Quick-Import-Extension/releases) ![Visitors](https://api.visitorbadge.io/api/visitors?path=https%3A%2F%2Fgithub.com%2FAfoxDesignz%2Fnorish-quick-import-extension&labelColor=%23faf5e8&countColor=%23336640) ![license](https://img.shields.io/badge/license-MIT-336640.svg?style=for-the-badge&labelColor=faf5e8) <br>
[![Static Badge](https://img.shields.io/badge/built_for_chromium-336640?style=for-the-badge&logo=googlechrome&logoColor=336640&labelColor=faf5e8)](<https://www.wikiwand.com/en/articles/Chromium_(web_browser)>)

---

<p align="center">
  <img
    alt="Logo"
    src="https://raw.githubusercontent.com/AfoxDesignz/Norish-Quick-Import-Extension/main/docs/logo/logo.png"
    width="180"
  />
</p>
<h1 align="center">Norish Quick Import</h1>

![](https://raw.githubusercontent.com/AfoxDesignz/Norish-Quick-Import-Extension/main/docs/images/screenshot_home.png)

Save recipes from any website into [Norish](https://github.com/norish-recipes/norish) in just two clicks while you browse.

<h3><picture><source media="(prefers-color-scheme: dark)" srcset="docs/icons/features-white.svg"><img alt="" src="docs/icons/features-black.svg" width="16" height="16"></picture> Features</h3>

- **Save recipes quickly**: send the current page's recipe to your Norish instance in two clicks.
- **Works on any site**: import recipes from any webpage - no site-specific setup required. _(has to be supported by norish)_
- **Simple setup**: enter your Norish domain and API key once. The settings sync with your browser profile.
- **Privacy-first**: only the page URL and your API key are sent to the Norish instance you configure.

**Planned**

- Improve the popup UI
- Add more functionality

<h3><picture><source media="(prefers-color-scheme: dark)" srcset="docs/icons/browsers-white.svg"><img alt="" src="docs/icons/browsers-black.svg" width="16" height="16"></picture> Supported browsers</h3>

- Chromium-based browsers with Manifest V3 support (tested with recent Google Chrome and Vivaldi versions).
- Firefox is currently not supported.

> [!NOTE]
> This extension is an independent project and is neither an official browser extension nor affiliated with the [Norish](https://github.com/norish-recipes/norish) project.

---

<h3><picture><source media="(prefers-color-scheme: dark)" srcset="docs/icons/quickstart-white.svg"><img alt="" src="docs/icons/quickstart-black.svg" width="16" height="16"></picture> Quickstart</h3>

Prebuilt releases include a ZIP of the compiled extension (contents of `dist/`). Read below if you want to build from source.

#### To install from a release:

1. Download and unzip the release ZIP.
2. Open `chrome://extensions` in your browser -> enable Developer mode -> click **Load unpacked** -> select the unzipped release folder.

#### After installation:

1. Open the Extensions menu of your browser (puzzle-piece icon) and **pin "Norish Quick Import"** to the extensions toolbar.
2. Go the the account settings of your [Norish](https://github.com/norish-recipes/norish) instance.
3. **Create a new API key** and copy it to your clipboard.
4. Click the extension icon in the extensions toolbar of your browser to **open the Norish Quick Import popup**.
5. **Fill out the domain of your [Norish](https://github.com/norish-recipes/norish) instance and paste your API key**.
6. Click `Save Settings`.
7. Your browser will ask you, if you want to allow `Norish Quick Import` to access your configured Instance Domain. **Click `Allow`**.

After setting up the Extension you can just browse the internet and whenever you find a recipe, that's worth saving into [Norish](https://github.com/norish-recipes/norish), just click the extension icon and hit `send`-Button.

> [!TIP]
> If you encounter any problem or have a question, feel free to create an [issue](https://github.com/AfoxDesignz/Norish-Quick-Import-Extension/issues/new).

---

<h3><picture><source media="(prefers-color-scheme: dark)" srcset="docs/icons/build-white.svg"><img alt="" src="docs/icons/build-black.svg" width="16" height="16"></picture> Build from source</h3>

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

4. Open `chrome://extensions` in your browser -> enable Developer mode -> click **Load unpacked** -> select the `dist/` folder.

---

<h3><picture><source media="(prefers-color-scheme: dark)" srcset="docs/icons/privacy-white.svg"><img alt="" src="docs/icons/privacy-black.svg" width="16" height="16"></picture> Privacy</h3>

Data handling:

- Stored locally (Chrome sync storage): your Norish domain and API key.
- Stored locally (Chrome local storage): the latest import status shown in the popup.
- Sent to your configured Norish instance during import: recipe URL and API key.
- **Not** sent: analytics, tracking data, or data to third-party services.

<h3><picture><source media="(prefers-color-scheme: dark)" srcset="docs/icons/permissions-white.svg"><img alt="" src="docs/icons/permissions-black.svg" width="16" height="16"></picture> Permissions</h3>

The extension currently requests:

- `storage`: stores your Norish domain/API key and the latest import status.
- `tabs`: reads the active tab URL so the recipe URL field can be prefilled.
- `optional_host_permissions` (`http://*/*`, `https://*/*`): when you save settings, the extension requests access only for your configured Norish domain.

---

<h3><picture><source media="(prefers-color-scheme: dark)" srcset="docs/icons/license-white.svg"><img alt="" src="docs/icons/license-black.svg" width="16" height="16"></picture> License</h3>

- This repository is licensed under the MIT License. See the `LICENSE` file for details.

---
