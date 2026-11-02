// The editor side-bar extension (vscode-extension/) as a .vsix, and putting it into the editors on this computer with
// their own command line (`code --install-extension …`): what `my-office install` does, `uninstall` takes it out. A
// .vsix is a zip: the extension's files under extension/, a manifest and a content-types list; written here (stored,
// not compressed: the three files are a few KB) so no packaging tool is needed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';

export const EXT_ID = 'my-office.my-office-panel';

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xFFFFFFFF; for (const b of buf) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
/** A zip of `files` ([[name, Buffer]]), stored. */
export function zip(files) {
  const parts = [], dir = [];
  let at = 0;
  for (const [name, data] of files) {
    const n = Buffer.from(name), crc = crc32(data), head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(0, 8);
    head.writeUInt32LE(0, 10); head.writeUInt32LE(crc, 14); head.writeUInt32LE(data.length, 18); head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(n.length, 26); head.writeUInt16LE(0, 28);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0x0800, 8); cd.writeUInt16LE(0, 10);
    cd.writeUInt32LE(0, 12); cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(n.length, 28); cd.writeUInt32LE(at, 42);
    parts.push(head, n, data); dir.push(cd, n);
    at += head.length + n.length + data.length;
  }
  const size = dir.reduce((s, b) => s + b.length, 0), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(size, 12); end.writeUInt32LE(at, 16);
  return Buffer.concat([...parts, ...dir, end]);
}
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
/** The .vsix of the extension in `src` (its package.json names it), written to `out`. */
export function buildVsix(src, out) {
  const pkg = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8'));
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(path.join(src, d), { withFileTypes: true })) { const r = d ? `${d}/${e.name}` : e.name; if (e.isDirectory()) walk(r); else files.push([`extension/${r}`, fs.readFileSync(path.join(src, r))]); } };
  walk('');
  const manifest = `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="${xml(pkg.name)}" Version="${xml(pkg.version)}" Publisher="${xml(pkg.publisher)}"/>
    <DisplayName>${xml(pkg.displayName)}</DisplayName>
    <Description xml:space="preserve">${xml(pkg.description)}</Description>
    <Categories>Other</Categories>
    <Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="${xml(pkg.engines.vscode)}"/></Properties>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation>
  <Dependencies/>
  <Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets>
</PackageManifest>
`;
  const types = '<?xml version="1.0" encoding="utf-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension=".json" ContentType="application/json"/><Default Extension=".js" ContentType="application/javascript"/><Default Extension=".svg" ContentType="image/svg+xml"/><Default Extension=".vsixmanifest" ContentType="text/xml"/></Types>\n';
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, zip([['extension.vsixmanifest', Buffer.from(manifest)], ['[Content_Types].xml', Buffer.from(types)], ...files]));
  return out;
}

// The editors' command lines: inside their app on a Mac, else on the PATH (the ones that take --install-extension)
const APPS = [['Antigravity IDE', '.antigravity-ide'], ['Antigravity', '.antigravity'], ['Visual Studio Code', '.vscode'], ['Visual Studio Code - Insiders', '.vscode-insiders'], ['Cursor', '.cursor'], ['Windsurf', '.windsurf'], ['Kiro', '.kiro'], ['Trae', '.trae']];
const ON_PATH = [['antigravity-ide', 'Antigravity IDE', '.antigravity-ide'], ['code', 'Visual Studio Code', '.vscode'], ['code-insiders', 'Visual Studio Code - Insiders', '.vscode-insiders'], ['cursor', 'Cursor', '.cursor'], ['windsurf', 'Windsurf', '.windsurf']];
export function editorClis({ home = os.homedir(), apps = '/Applications', env = process.env } = {}) {
  const found = [], seen = new Set();
  if (process.platform === 'darwin') {
    for (const [app, dot] of APPS) {
      const bin = path.join(apps, `${app}.app`, 'Contents', 'Resources', 'app', 'bin');
      let f = null; try { f = fs.readdirSync(bin).find((x) => !x.endsWith('.cmd') && !x.startsWith('.')); } catch { /* not installed */ }
      if (f) { found.push({ app, dot, cli: path.join(bin, f) }); seen.add(app); }
    }
  }
  const exe = process.platform === 'win32' ? ['.cmd', '.exe'] : [''];
  for (const [cmd, app, dot] of ON_PATH) {
    if (seen.has(app)) continue;
    for (const d of String(env.PATH || '').split(path.delimiter)) {
      const hit = d && exe.map((x) => path.join(d, cmd + x)).find((p) => fs.existsSync(p));
      if (hit) { found.push({ app, dot, cli: hit }); seen.add(app); break; }
    }
  }
  return found.filter((x) => fs.existsSync(path.join(home, x.dot)));   // (an editor that has been opened here)
}
const run = (cli, args) => new Promise((resolve) => execFile(cli, args, { timeout: 120_000, windowsHide: true, shell: process.platform === 'win32' }, (err) => resolve(!err)));
/** Into each editor: [{ app, ok }]. */
export async function installPanel(vsix, clis = editorClis()) {
  const out = [];
  for (const e of clis) out.push({ app: e.app, ok: await run(e.cli, ['--install-extension', vsix, '--force']) });
  return out;
}
export async function uninstallPanel(clis = editorClis()) {
  const out = [];
  for (const e of clis) out.push({ app: e.app, ok: await run(e.cli, ['--uninstall-extension', EXT_ID]) });
  return out;
}
/** The editors that have it (its folder in their extensions). */
export function panelIn({ home = os.homedir() } = {}) {
  return APPS.filter(([, dot]) => { try { return fs.readdirSync(path.join(home, dot, 'extensions')).some((e) => e.startsWith(`${EXT_ID}-`)); } catch { return false; } }).map(([app]) => app);
}
