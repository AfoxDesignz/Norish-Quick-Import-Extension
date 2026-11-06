import { useState, useEffect } from "react";
import { getActiveTab, isExtensionContextValid } from "../lib/browser";

export function useCurrentTabUrl(): string {
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!isExtensionContextValid()) return;

    void getActiveTab().then((tab) => {
      if (tab?.url) setUrl(tab.url);
    });
  }, []);

  return url;
}
