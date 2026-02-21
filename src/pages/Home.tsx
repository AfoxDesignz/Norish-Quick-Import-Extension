import { Button } from "@heroui/react";
import { Cog6ToothIcon } from "@heroicons/react/20/solid";
import RecipeImportForm from "../components/RecipeImportForm";
import type { StoredConfig } from "../types/storage";
import VersionChip from "../components/VersionChip";

interface HomeProps {
  config: Required<StoredConfig>;
  onNavigateSettings: () => void;
}

export default function Home({ config, onNavigateSettings }: HomeProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between w-full">
        <div className="flex items-baseline gap-2">
          <h1 className="text-xl font-bold">Norish Quick Import</h1>
          <VersionChip />
        </div>
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          className="group hover:!bg-default-300/50"
          onPress={() => {
            onNavigateSettings();
          }}
          aria-label="Open settings"
        >
          <Cog6ToothIcon className="size-4 text-foreground transition-transform duration-300 ease-out group-hover:rotate-30 group-hover:scale-100" />
        </Button>
      </div>
      <RecipeImportForm config={config} />
    </div>
  );
}
