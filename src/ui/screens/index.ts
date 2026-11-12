// Public surface of the shell screens: the router (what App.tsx renders), navigation helpers and the screens
// themselves for the demo page and later tasks.
export { ScreenRouter } from './ScreenRouter';
export { nav, updateNav, openOverlay, closeTop, closeAll, activeOverlay, baseScreen, onModeChange, initialNav, type OverlayId, type NavState, type SettingsTabId, type SaveTabId } from './nav';
export { Title } from './Title';
export { Loading } from './Loading';
export { Pause } from './Pause';
export { NewGame } from './newgame/NewGame';
export { Settings } from './settings/Settings';
export { SaveLoad } from './saves/SaveLoad';
export { Credits } from './credits/Credits';
export { BootGate, Unsupported, ErrorOverlay, EpitaphCard, BookPlaceholder } from './Simple';
export { newGameForm, lastRequest, buildRequest, defaultForm } from './newgame/form';
