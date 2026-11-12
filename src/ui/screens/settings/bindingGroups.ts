// The binding table's groups (GDD 01 5, GDD 08 7.5): every rebindable action under the context it lives in.
import { ACTIONS, type ActionDef } from '@/input';
import { contextName } from './captureBinding';

/** Display order of the groups (GDD 01 5: contexts). */
const GROUP_ORDER = ['G', 'P', 'O', 'C', 'Ph', 'TL', 'UI'] as const;
const GROUP_TITLES: Record<string, string> = {
  G: 'Everywhere', P: 'Possession', O: 'Observer', C: 'Colony view', Ph: 'Photo mode', TL: 'Time-lapse', UI: 'Menus',
};

/** Actions grouped by their first context, in the table's display order. */
export function groupActions(actions: readonly ActionDef[] = ACTIONS): { id: string; title: string; actions: ActionDef[] }[] {
  const out = GROUP_ORDER.map((id) => ({ id: id as string, title: GROUP_TITLES[id] ?? contextName(id), actions: [] as ActionDef[] }));
  for (const a of actions) out.find((g) => g.id === a.contexts[0])?.actions.push(a);
  return out.filter((g) => g.actions.length > 0);
}
