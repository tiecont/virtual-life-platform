// Pixi's reviewed no-eval polyfills are scoped to this optional mobile entry.
// Keep the existing browser renderer/algorithm unchanged.
import 'pixi.js/unsafe-eval';
export {createCafeScene} from './renderer';
