// Public surface of the input system. Pure modules (Node-testable) plus the DOM adapter.
export * from './types';
export * from './defaults';
export { ACTIONS, AXES, BUTTON_ACTIONS, actionDef, axisDef, axisComponents, requiredActionIds } from './actions';
export * from './bindings';
export * from './rebind';
export * from './contexts';
export * from './gamepad';
export { PointerLockPolicy, type PointerLockNotice } from './pointerLock';
export { InputState } from './inputState';
export { attachDomInput, type DomInput, type DomInputOptions } from './domAdapter';
