import { matchInAppBinding, type Bindings } from '../store/keybindingsStore';
import type { KeyAction } from '@/lib/shortcuts/shortcutActions';

export function matchInAppShortcutAction(
  event: KeyboardEvent,
  bindings: Bindings
): KeyAction | null {
  return (Object.entries(bindings) as [KeyAction, string | null][])
    .find(([, binding]) => matchInAppBinding(event, binding))?.[0] ?? null;
}
