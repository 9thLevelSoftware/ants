// Reads and writes the game's settings through the facade, re-rendering after each change. Changes apply at once
// (GDD 08 7.4); persistence is the game's (the save task).
import { useCallback, useState } from 'preact/hooks';
import type { GameSettings, SettingsPatch } from '../../api';
import { facade } from '../../store';

export function useGameSettings(): [GameSettings | null, (patch: SettingsPatch) => void] {
  const f = facade.value;
  const [settings, setSettings] = useState<GameSettings | null>(() => f?.getSettings() ?? null);
  const apply = useCallback((patch: SettingsPatch) => {
    const g = facade.value;
    if (!g) return;
    g.setSettings(patch);
    setSettings(g.getSettings());
  }, []);
  return [settings, apply];
}
