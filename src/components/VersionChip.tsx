import { Chip, Tooltip, Link } from "@heroui/react";
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/16/solid";
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
        className="text-[10px] no-underline hover:underline"
        onMouseEnter={() => setIsUpdateHovered(true)}
        onMouseLeave={() => setIsUpdateHovered(false)}
      >
        v{currentVersion}
        {isUpdateHovered && (
          <ArrowTopRightOnSquareIcon className="ml-1 w-3 h-3" />
        )}
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
          >
            <ArrowPathIcon width={12} />
            <Chip.Label>Update</Chip.Label>
          </Chip>
        </Link>
      </Tooltip.Trigger>
      <Tooltip.Content
        showArrow
        placement="bottom"
        className="flex items-center gap-1.5 bg-content1 text-foreground border border-default-200 shadow-sm"
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
