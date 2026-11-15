// What the Colony health buttons do (GDD 08 4.4): remedies open the control concerned and highlight it (they never apply a
// change), "Show" moves the camera. The Game side lives behind the panels bridge and the facade; without them a remedy
// still opens the panel it names.
import { openPanel } from '../../hud/state';
import { facade } from '../../store';
import type { UiFocus } from '../../api';
import { highlightControl } from '../wiring/highlight';
import { panelsBridge } from '../wiring/state';
import { remedySelector, type RemedyLink } from './model';

export function runRemedy(link: RemedyLink): void {
  const a = link.action;
  const bridge = panelsBridge.peek();
  switch (a.kind) {
    case 'directives':
      openPanel('directives');
      void highlightControl(remedySelector(a));
      return;
    case 'tool':
      bridge?.selectTool(a.tool);
      void highlightControl(`[data-tool="${a.tool}"]`);
      return;
    case 'plan':
      bridge?.setPlanner({ template: 'chamber', chamberType: a.chamberType });
      bridge?.selectTool('dig');
      void highlightControl('[data-tool="dig"]');
      return;
    case 'possess':
      facade.peek()?.possess(a.role);
      return;
    case 'advice':
      return;
  }
}

/** "Show": the camera goes to the diagnostic's focus (observer, or the colony view for something underground). */
export function showFocus(focus: UiFocus): void {
  panelsBridge.peek()?.jumpTo(focus);
}
