import { useState, useEffect } from "react";
import { getChromeRuntimeError, isExtensionContextValid } from "../lib/chrome";

export function useCurrentTabUrl(): string {
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!isExtensionContextValid()) return;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (getChromeRuntimeError()) return;

      const tabUrl = tabs?.[0]?.url;
      if (tabUrl) setUrl(tabUrl);
    });
  }, []);

  return url;
}
