// Small hooks on the Game object the controller listens to, without editing Game or the persistence module.
// `hookMethod` wraps one method of an object. The wrapper survives a later assignment of the same name (the persistence
// module adds `resetHints` to the game some time after boot) and `unhook` puts everything back as it was.
type AnyFn = (...args: never[]) => unknown;

/** `wrap` gets the method as it is now (undefined when the object has none yet) and returns the function to install. */
export function hookMethod(obj: object, name: string, wrap: (raw: AnyFn | undefined) => AnyFn): () => void {
  const own = Object.getOwnPropertyDescriptor(obj, name);
  if (own && !('value' in own)) return () => {}; // somebody else's accessor: leave it alone
  const inherited = (obj as Record<string, unknown>)[name] as AnyFn | undefined;
  let raw = inherited;
  let wrapped = wrap(raw);
  Object.defineProperty(obj, name, {
    configurable: true,
    enumerable: own?.enumerable ?? true,
    get: () => wrapped,
    set: (v: AnyFn | undefined) => { raw = v; wrapped = wrap(raw); },
  });
  return () => {
    if (raw === undefined || (!own && raw === inherited)) delete (obj as Record<string, unknown>)[name];
    else Object.defineProperty(obj, name, { value: raw, writable: true, configurable: true, enumerable: own?.enumerable ?? true });
  };
}
