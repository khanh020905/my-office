// The 3D world is built when the page starts, or (the page opened in the 2D list) the first time something asks for it:
// the 3D view, a replay, a setting of the scene. main.js hands its builder over here, so a module that needs the world
// asks for it without importing main.js; state.world says whether it is there.
import { state } from './state.js';

let builder = null;
export const setWorldBuilder = (f) => { builder = f; };
export function needWorld() { if (!state.world && builder) builder(); }
