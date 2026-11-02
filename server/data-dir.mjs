// Where the office keeps its data (prefs, the phone PIN, the history vault, the other AI tools' sign-ins, its log):
// data/ in the folder it runs from, for a clone of the repository; ~/.my-office when npm installed it (in a node_modules
// folder, which `npm install -g my-office@latest` or npx's cache replaces whole). OFFICE_DATA_DIR wins: the tests, a
// second copy.
import os from 'node:os';
import path from 'node:path';

export function dataDir(root, env = process.env) {
  if (env.OFFICE_DATA_DIR) return path.resolve(env.OFFICE_DATA_DIR);
  return path.resolve(root).split(/[\\/]/).includes('node_modules') ? path.join(os.homedir(), '.my-office') : path.join(root, 'data');
}
