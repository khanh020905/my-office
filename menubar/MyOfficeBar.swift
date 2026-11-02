// My Office in the Mac's menu bar: an icon with the number of sessions waiting for you (or at work), coloured when a
// plan's limit runs low; a click opens the office's small panel (/panel) in a popover, a right-click a short menu; a
// notification when a session starts waiting for you or finishes. It reads the office's /api/panel every 3 seconds.
// Built by `my-office install` (bin/cli.mjs: swiftc, then an app bundle in the office's data folder) and started by
// the office. The port comes as the first argument (4310 when there is none).
import Cocoa
import WebKit
import UserNotifications

let port = CommandLine.arguments.dropFirst().first ?? "4310"
let base = "http://127.0.0.1:\(port)"

final class Bar: NSObject, NSApplicationDelegate, NSPopoverDelegate, UNUserNotificationCenterDelegate {
  var item: NSStatusItem!
  let popover = NSPopover()
  var web: WKWebView!
  var timer: Timer?
  var words: [String: String] = [:]
  var seen: [String: String] = [:]   // session id -> its status at the last reading
  var first = true

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
    web = WKWebView(frame: NSRect(x: 0, y: 0, width: 360, height: 560), configuration: WKWebViewConfiguration())
    let vc = NSViewController()
    vc.view = web
    popover.contentViewController = vc
    popover.contentSize = NSSize(width: 360, height: 560)
    popover.behavior = .transient
    popover.delegate = self
    let center = UNUserNotificationCenter.current()
    center.delegate = self
    center.requestAuthorization(options: [.alert, .sound]) { _, _ in }
    poll()
    timer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in self?.poll() }
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
    if let w = j["words"] as? [String: String] { words = w }
    let waiting = j["waiting"] as? Int ?? 0, working = j["working"] as? Int ?? 0, level = j["level"] as? String ?? "ok"
    let n = waiting > 0 ? waiting : working
    let colour: NSColor = waiting > 0 ? .systemOrange : level == "critical" ? .systemRed : level == "warn" ? .systemYellow : .labelColor
    b.attributedTitle = NSAttributedString(string: n > 0 ? " \(n)" : (level == "ok" ? "" : " •"), attributes: [.foregroundColor: colour, .font: NSFont.monospacedDigitSystemFont(ofSize: 12, weight: .semibold)])
    b.toolTip = j["summary"] as? String
    let sessions = j["sessions"] as? [[String: Any]] ?? []
    var now: [String: String] = [:]
    for s in sessions {
      guard let id = s["id"] as? String, let st = s["status"] as? String else { continue }
      now[id] = st
      let name = s["name"] as? String ?? "", was = seen[id]
      if first || popover.isShown || was == st { continue }
      if st == "wait" { notify(id: "wait-\(id)", text: (words["wait"] ?? "{name} waits for you").replacingOccurrences(of: "{name}", with: name)) }
      else if st == "rest" && (was == "work" || was == "wait") { notify(id: "done-\(id)", text: (words["done"] ?? "{name} is done").replacingOccurrences(of: "{name}", with: name)) }
    }
    seen = now
    first = false
  }
  func notify(id: String, text: String) {
    let c = UNMutableNotificationContent()
    c.title = "My Office"
    c.body = text
    c.sound = .default
    UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: c, trigger: nil))
  }
  // a notification clicked: the panel
  func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler done: @escaping () -> Void) {
    if !popover.isShown { toggle() }
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
