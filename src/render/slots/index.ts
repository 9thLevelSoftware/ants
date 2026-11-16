// Adapters that plug the real renderers into the registry (src/render/index.ts).
export { WorldSlot } from './worldSlot';
export { NestSlot } from './nestSlot';
export { AntsSlot, antSource } from './antsSlot';
export { CreaturesSlot } from './creaturesSlot';
export { HumansSlot } from './humansSlot';
export { WeatherSlot } from './weatherSlot';
export { FxSlot } from './fxSlot';
export { nullHumansRenderer, nullWeatherRenderer } from './nullSlots';
