// My Office in the editor's side bar: the office's small panel (http://127.0.0.1:4310/panel) in a webview, so the
// sessions, what waits for your approval and the plans' limits are where you work. While the office isn't running it
// says so, and looks again every 10 seconds. Installed by `my-office install` (server/vsix.mjs packs this folder).
const vscode = require('vscode');
const http = require('http');

const up = (port) => new Promise((resolve) => {
  const req = http.get({ host: '127.0.0.1', port, path: '/health', timeout: 2000 }, (res) => { res.resume(); resolve(res.statusCode === 200); });
  req.on('error', () => resolve(false)); req.on('timeout', () => { req.destroy(); resolve(false); });
});
const page = (body, port) => `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http://127.0.0.1:${port}; style-src 'unsafe-inline';">
<style>html,body{margin:0;padding:0;height:100%;background:#0D1219;color:#8D97AA;font:13px/1.5 system-ui,sans-serif}
iframe{display:block;width:100%;height:100%;border:0}p{margin:16px}code{color:#E8ECF4}</style></head><body>${body}</body></html>`;

function activate(context) {
  const provider = {
    resolveWebviewView(view) {
      let shown = '', timer = null;
      const show = async () => {
        const port = Number(vscode.workspace.getConfiguration('myOffice').get('port')) || 4310;
        const want = (await up(port)) ? `office:${port}` : 'down';
        if (want === shown) return;
        shown = want;
        view.webview.html = want === 'down'
          ? page(`<p>${vscode.env.language.startsWith('vi') ? 'Văn phòng chưa chạy. Bật bằng lệnh' : "My Office isn't running. Start it with"} <code>my-office start</code>.</p>`, port)
          : page(`<iframe src="http://127.0.0.1:${port}/panel?embed=ide" title="My Office"></iframe>`, port);
      };
      show();
      timer = setInterval(show, 10_000);
      view.onDidDispose(() => clearInterval(timer));
    },
  };
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('myOffice.panel', provider, { webviewOptions: { retainContextWhenHidden: true } }));
}
module.exports = { activate, deactivate() {} };
