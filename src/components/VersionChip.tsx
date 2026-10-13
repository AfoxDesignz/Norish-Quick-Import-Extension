import { Chip, Tooltip, Link } from "@heroui/react";
import { ArrowPathIcon } from "@heroicons/react/16/solid";
import { useState } from "react";
import { useVersionInfo } from "../hooks/useVersionInfo";

export default function VersionChip() {
  const { currentVersion, latestVersion, hasUpdate, releaseUrl } =
    useVersionInfo();
  const [isUpdateHovered, setIsUpdateHovered] = useState(false);

  if (!hasUpdate) {
    return (
      <Link
        href={releaseUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[10px] font-medium text-muted hover:text-foreground transition-colors px-1.5 py-0.5 rounded-full bg-default-200/60 hover:bg-default-300/60 no-underline"
        aria-label={`Extension version ${currentVersion}`}
      >
        v{currentVersion}
      </Link>
    );
  }

  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger aria-label="Status chip">
        <Link
          href={releaseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex no-underline"
          onMouseEnter={() => setIsUpdateHovered(true)}
          onMouseLeave={() => setIsUpdateHovered(false)}
        >
          <Chip
            color="success"
            variant={isUpdateHovered ? "primary" : "soft"}
            size="sm"
            className="rounded-full h-5 text-[10px] px-2 font-medium"
          >
            <ArrowPathIcon className="size-3" />
            <Chip.Label>Update</Chip.Label>
          </Chip>
        </Link>
      </Tooltip.Trigger>
      <Tooltip.Content
        showArrow
        placement="bottom"
        className="flex items-center gap-1.5 bg-surface text-foreground border border-border shadow-md rounded-xl px-2.5 py-1.5 text-xs"
      >
        <span className="relative flex size-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-success" />
        </span>
        <p>Update available: v{latestVersion?.replace(/^v/i, "")}</p>
      </Tooltip.Content>
    </Tooltip>
  );
}
