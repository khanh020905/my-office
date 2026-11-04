// My Office in the Mac's menu bar: an icon with the number of sessions waiting for you (or at work), coloured when a
// plan's limit runs low; a click opens the office's small panel (/panel) in a popover, a right-click a short menu; a
// notification when a session starts waiting for you or finishes. It reads the office's /api/panel every 3 seconds.
// Built by `my-office install` (bin/cli.mjs: swiftc, then an app bundle in the office's data folder) and started by
// the office. The port comes as the first argument (4310 when there is none). ⌃⌥O opens and closes the panel from
// anywhere (a Carbon hot key: no accessibility permission needed); Esc in the panel closes it.
import Cocoa
import WebKit
import UserNotifications
import Carbon.HIToolbox

let port = CommandLine.arguments.dropFirst().first ?? "4310"
let base = "http://127.0.0.1:\(port)"

final class Bar: NSObject, NSApplicationDelegate, NSPopoverDelegate, UNUserNotificationCenterDelegate, WKScriptMessageHandler {
  var item: NSStatusItem!
  let popover = NSPopover()
  var web: WKWebView!
  var timer: Timer?
  var words: [String: String] = [:]
  var seen: [String: String] = [:]   // session id -> its status at the last reading
  var first = true
  var held: [String: [String: Any]] = [:]   // request id -> what /api/panel said of it (a banner is up for it)

  func applicationDidFinishLaunching(_ note: Notification) {
    item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    if let b = item.button {
      b.image = NSImage(systemSymbolName: "building.2", accessibilityDescription: "My Office")
      b.image?.isTemplate = true
      b.imagePosition = .imageLeading
      b.target = self
      b.action = #selector(clicked(_:))
      b.sendAction(on: [.leftMouseUp, .rightMouseUp])
    }
    let config = WKWebViewConfiguration()
    config.userContentController.add(self, name: "bar")   // (the panel's Esc: src/panel/keys.js)
    web = WKWebView(frame: NSRect(x: 0, y: 0, width: 360, height: 560), configuration: config)
    let vc = NSViewController()
    vc.view = web
    popover.contentViewController = vc
    popover.contentSize = NSSize(width: 360, height: 560)
    popover.behavior = .transient
    popover.delegate = self
    let center = UNUserNotificationCenter.current()
    center.delegate = self
    center.setNotificationCategories(categories())
    center.requestAuthorization(options: [.alert, .sound]) { _, _ in }
    poll()
    timer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in self?.poll() }
    hotKey()
  }

  // ⌃⌥O: the panel, from any app
  var hotKeyRef: EventHotKeyRef?
  func hotKey() {
    var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
    InstallEventHandler(GetApplicationEventTarget(), { _, _, me in
      guard let me = me else { return noErr }
      let bar = Unmanaged<Bar>.fromOpaque(me).takeUnretainedValue()
      DispatchQueue.main.async { bar.toggle() }
      return noErr
    }, 1, &spec, Unmanaged.passUnretained(self).toOpaque(), nil)
    let id = EventHotKeyID(signature: OSType(0x4D4F4642), id: 1)   // ('MOFB')
    RegisterEventHotKey(UInt32(kVK_ANSI_O), UInt32(controlKey | optionKey), id, GetApplicationEventTarget(), 0, &hotKeyRef)
  }
  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    if message.body as? String == "close", popover.isShown { popover.performClose(nil) }
  }

  @objc func clicked(_ sender: NSStatusBarButton) {
    if NSApp.currentEvent?.type == .rightMouseUp { menu(); return }
    toggle()
  }
  func toggle() {
    if popover.isShown { popover.performClose(nil); return }
    guard let b = item.button else { return }
    if web.url == nil, let u = URL(string: "\(base)/panel?embed=menubar") { web.load(URLRequest(url: u)) }
    popover.show(relativeTo: b.bounds, of: b, preferredEdge: .minY)
    NSApp.activate(ignoringOtherApps: true)
    popover.contentViewController?.view.window?.makeKey()
    popover.contentViewController?.view.window?.makeFirstResponder(web)   // (the keys work at once: src/panel/keys.js)
  }
  func menu() {
    let m = NSMenu()
    m.addItem(withTitle: words["open"] ?? "Open the office", action: #selector(openOffice), keyEquivalent: "").target = self
    m.addItem(withTitle: words["list"] ?? "List view", action: #selector(openList), keyEquivalent: "").target = self
    m.addItem(.separator())
    m.addItem(withTitle: words["quit"] ?? "Hide the icon (until the office starts again)", action: #selector(quit), keyEquivalent: "").target = self
    item.menu = m
    item.button?.performClick(nil)
    item.menu = nil
  }
  @objc func openOffice() { if let u = URL(string: base) { NSWorkspace.shared.open(u) } }
  @objc func openList() { if let u = URL(string: "\(base)/?view=2d") { NSWorkspace.shared.open(u) } }
  @objc func quit() { NSApp.terminate(nil) }

  // the buttons on a banner (their words come from the office, in its language; these are only the first-run fallbacks)
  func categories() -> Set<UNNotificationCategory> {
    let allow = UNNotificationAction(identifier: "allow", title: words["allow"] ?? "Allow", options: [])
    let deny = UNNotificationAction(identifier: "deny", title: words["deny"] ?? "Deny", options: [.destructive])
    let ide = UNNotificationAction(identifier: "skip", title: words["ide"] ?? "Answer in the IDE", options: [])
    let answer = UNNotificationAction(identifier: "open", title: words["answer"] ?? "Open to answer", options: [.foreground])
    let window = UNNotificationAction(identifier: "window", title: words["window"] ?? "Open the session window", options: [])
    func cat(_ id: String, _ a: [UNNotificationAction]) -> UNNotificationCategory {
      UNNotificationCategory(identifier: id, actions: a, intentIdentifiers: [], options: [])
    }
    return [cat("perm", [allow, deny, ide]), cat("perm-risky", [deny, ide]), cat("ask", [answer]), cat("done", [window])]
  }
  func post(_ path: String, _ body: [String: Any], _ then: (() -> Void)? = nil) {
    guard let u = URL(string: "\(base)\(path)"), let data = try? JSONSerialization.data(withJSONObject: body) else { return }
    var req = URLRequest(url: u)
    req.httpMethod = "POST"
    req.httpBody = data
    req.timeoutInterval = 5
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")   // (no Origin: this is not a web page; the office answers this computer only)
    URLSession.shared.dataTask(with: req) { _, _, _ in if let t = then { DispatchQueue.main.async { t() } } }.resume()
  }

  func poll() {
    guard let u = URL(string: "\(base)/api/panel") else { return }
    var req = URLRequest(url: u)
    req.timeoutInterval = 4
    URLSession.shared.dataTask(with: req) { data, _, _ in
      let j = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
      DispatchQueue.main.async { self.show(j) }
    }.resume()
  }
  // the icon's number and colour, and a notification for what changed since the last reading
  func show(_ j: [String: Any]?) {
    guard let j = j, let b = item.button else { item.button?.title = ""; item.button?.toolTip = words["off"] ?? "My Office isn't running"; return }
    if let w = j["words"] as? [String: String] {
      if w != words { words = w; UNUserNotificationCenter.current().setNotificationCategories(categories()) }
    }
    let waiting = j["waiting"] as? Int ?? 0, working = j["working"] as? Int ?? 0, level = j["level"] as? String ?? "ok"
    let n = waiting > 0 ? waiting : working
    let colour: NSColor = waiting > 0 ? .systemOrange : level == "critical" ? .systemRed : level == "warn" ? .systemYellow : .labelColor
    b.attributedTitle = NSAttributedString(string: n > 0 ? " \(n)" : (level == "ok" ? "" : " •"), attributes: [.foregroundColor: colour, .font: NSFont.monospacedDigitSystemFont(ofSize: 12, weight: .semibold)])
    b.toolTip = j["summary"] as? String
    let sessions = j["sessions"] as? [[String: Any]] ?? []
    // requests Claude is holding for an answer: a banner each, taken back when the request is settled anywhere
    var nowHeld: [String: [String: Any]] = [:]
    var holding = Set<String>()   // sessions with a held request: the generic "waits for you" banner would only repeat it
    for r in j["held"] as? [[String: Any]] ?? [] {
      guard let id = r["id"] as? String else { continue }
      nowHeld[id] = r
      if let sid = r["sess"] as? String { holding.insert(sid) }
      if held[id] == nil && !first && !popover.isShown { notifyHeld(r) }
    }
    let gone = held.keys.filter { nowHeld[$0] == nil }.map { "perm-\($0)" }
    if !gone.isEmpty { UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: gone) }
    held = nowHeld
    var now: [String: String] = [:]
    for s in sessions {
      guard let id = s["id"] as? String, let st = s["status"] as? String else { continue }
      now[id] = st
      let name = s["name"] as? String ?? "", was = seen[id]
      if first || popover.isShown || was == st { continue }
      if st == "wait" { if holding.contains(id) { continue }; notify(id: "wait-\(id)", text: (words["wait"] ?? "{name} waits for you").replacingOccurrences(of: "{name}", with: name)) }
      else if st == "rest" && (was == "work" || was == "wait") { notify(id: "done-\(id)", text: (words["done"] ?? "{name} is done").replacingOccurrences(of: "{name}", with: name), category: "done", info: ["sess": id]) }
    }
    seen = now
    first = false
  }
  // a banner for a held request: the session's name, what it wants; Allow / Deny / "in the IDE" for a tool (a risky
  // command gets no Allow here), a button that opens the panel for a question or a plan
  func notifyHeld(_ r: [String: Any]) {
    guard let id = r["id"] as? String else { return }
    let kind = r["kind"] as? String ?? "perm", risky = r["risky"] as? Bool ?? false
    let c = UNMutableNotificationContent()
    c.title = r["name"] as? String ?? "My Office"
    let detail = r["detail"] as? String ?? ""
    c.body = kind == "plan" && detail.isEmpty ? (words["plan"] ?? "A plan needs your approval") : detail
    c.sound = .default
    c.categoryIdentifier = kind == "perm" ? (risky ? "perm-risky" : "perm") : "ask"
    c.userInfo = ["req": id, "sess": r["sess"] as? String ?? ""]
    UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "perm-\(id)", content: c, trigger: nil))
  }
  func notify(id: String, text: String, category: String = "", info: [String: Any] = [:]) {
    let c = UNMutableNotificationContent()
    c.title = "My Office"
    c.body = text
    c.sound = .default
    if !category.isEmpty { c.categoryIdentifier = category }
    c.userInfo = info
    UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: c, trigger: nil))
  }
  // a notification clicked: the panel
  func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler done: @escaping () -> Void) {
    let info = response.notification.request.content.userInfo
    switch response.actionIdentifier {
    case "allow", "deny", "skip":
      if let req = info["req"] as? String { post("/api/panel/answer", ["id": req, "choice": response.actionIdentifier]) { done() }; return }
    case "window":
      if let sess = info["sess"] as? String { post("/api/open", ["id": sess]) { done() }; return }
    default:
      if !popover.isShown { toggle() }   // (the banner itself, or the button for a question or a plan: the panel)
    }
    done()
  }
  func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler done: @escaping (UNNotificationPresentationOptions) -> Void) {
    done([.banner, .sound])
  }
}

let app = NSApplication.shared
let bar = Bar()
app.delegate = bar
app.setActivationPolicy(.accessory)
app.run()
