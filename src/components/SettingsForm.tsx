import { useEffect, useState } from "react";
import {
  Button,
  TextField,
  Label,
  FieldError,
  Form,
  InputGroup,
} from "@heroui/react";
import { useSettings } from "../hooks/useSettings";

interface SettingsFormProps {
  onSaved: () => void;
}

export default function SettingsForm({ onSaved }: SettingsFormProps) {
  const { settings, saveSettings } = useSettings();
  const [domain, setDomain] = useState(settings.instanceDomain ?? "");
  const [apiKey, setApiKey] = useState(settings.apiKey ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [didHydrateFromSettings, setDidHydrateFromSettings] = useState(false);

  useEffect(() => {
    if (didHydrateFromSettings) return;
    if (settings.instanceDomain === undefined && settings.apiKey === undefined)
      return;

    setDomain(settings.instanceDomain ?? "");
    setApiKey(settings.apiKey ?? "");
    setDidHydrateFromSettings(true);
  }, [didHydrateFromSettings, settings.apiKey, settings.instanceDomain]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedDomain = domain.trim();
    const trimmedKey = apiKey.trim();

    if (!trimmedDomain || !trimmedKey) {
      setError("Both fields are required.");
      return;
    }

    let normalized = trimmedDomain;
    if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
    try {
      new URL(normalized);
    } catch {
      setError("Please enter a valid domain.");
      return;
    }

    setIsSaving(true);
    try {
      const domainToSave = trimmedDomain.replace(/^https?:\/\//i, "");
      await saveSettings(domainToSave, trimmedKey);
      onSaved();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to save settings. Please try again.";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <TextField
        fullWidth
        value={domain}
        onChange={setDomain}
        isRequired
        name="instanceDomain"
      >
        <Label>Instance Domain</Label>
        <InputGroup fullWidth>
          <InputGroup.Prefix>https://</InputGroup.Prefix>
          <InputGroup.Input
            className="text-sm"
            placeholder="your.norish.domain"
          />
        </InputGroup>
        <FieldError />
      </TextField>

      <TextField
        fullWidth
        value={apiKey}
        onChange={setApiKey}
        isRequired
        name="apiKey"
        type="password"
      >
        <Label>API Key</Label>
        <InputGroup fullWidth>
          <InputGroup.Input className="text-sm" placeholder="Your API key" />
        </InputGroup>
        <FieldError />
      </TextField>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button type="submit" variant="primary" fullWidth isPending={isSaving}>
        Save Settings
      </Button>
    </Form>
  );
}
