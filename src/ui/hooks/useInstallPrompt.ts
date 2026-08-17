import { useEffect, useState } from 'react';
import { promptInstall, watchInstallPrompt } from '../../pwa/install';

export interface InstallPromptState {
  readonly available: boolean;
  readonly promptInstall: () => Promise<boolean>;
}

/** Expose un bouton d'installation personnalise pilote par `beforeinstallprompt`. */
export function useInstallPrompt(): InstallPromptState {
  const [available, setAvailable] = useState(false);

  useEffect(() => watchInstallPrompt(setAvailable), []);

  return { available, promptInstall };
}
