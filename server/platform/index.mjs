// The machine behind the Mac panel, whatever it runs: one module per operating system with the same functions
// (processes, memory, disk, sockets, working folders, start times, folder sizes, Claude Code's sign-in), so
// system.mjs and index.mjs only interpret readings. macOS: darwin.mjs, Windows: win32.mjs, anything else: linux.mjs.
import * as darwin from './darwin.mjs';
import * as linux from './linux.mjs';
import * as win32 from './win32.mjs';

export const OS = process.platform === 'darwin' ? darwin : process.platform === 'win32' ? win32 : linux;
