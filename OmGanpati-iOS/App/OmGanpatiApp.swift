import SwiftUI
import WebKit
import CoreBluetooth
import UniformTypeIdentifiers

@main struct OmGanpatiApp: App {
    var body: some Scene { WindowGroup { Calculator().ignoresSafeArea(.keyboard) } }
}
struct Calculator: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> CalculatorController { CalculatorController() }
    func updateUIViewController(_ controller: CalculatorController, context: Context) {}
}
final class CalculatorController: UIViewController, WKNavigationDelegate, WKScriptMessageHandlerWithReply, WKURLSchemeHandler, CBCentralManagerDelegate, CBPeripheralDelegate {
    var estimateExportFolder: URL?
    var web: WKWebView!
    var central: CBCentralManager!
    var devices = [UUID: CBPeripheral]()
    var printer: CBPeripheral?
    var characteristic: CBCharacteristic?
    var pending: ((Any?, String?) -> Void)?
    var timeout: DispatchWorkItem?
    let endpoints = ["E7810A71-73AE-499D-8C15-FAA9AEF0C3F2":"BEF8D6C9-9C21-4C9E-B632-BD58C1009F9F", "FF00":"FF02", "18F0":"2AF1"]
    override func viewDidLoad() {
        super.viewDidLoad()
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(self, forURLScheme: "jewellery")
        config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "printer")
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        view = web
        web.load(URLRequest(url: URL(string: "jewellery://local/index.html")!))
    }
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url, url.host == "local", !url.path.contains(".."),
              let root = Bundle.main.resourceURL?.appendingPathComponent("Web") else { task.didFailWithError(URLError(.badURL)); return }
        let file = root.appendingPathComponent(url.path)
        guard let data = try? Data(contentsOf: file) else { task.didFailWithError(URLError(.fileDoesNotExist)); return }
        let mime = file.pathExtension == "mjs" ? "text/javascript" : UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        task.didReceive(URLResponse(url: url, mimeType: mime, expectedContentLength: data.count, textEncodingName: "utf-8"))
        task.didReceive(data); task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if action.request.url?.scheme == "jewellery" { decisionHandler(.allow) }
        else { decisionHandler(.cancel); if let url = action.request.url, ["https","http"].contains(url.scheme ?? "") { UIApplication.shared.open(url) } }
    }
    func finish(_ value: Any? = nil, _ error: String? = nil) {
        timeout?.cancel(); timeout = nil
        let reply = pending; pending = nil; reply?(value,error)
    }
    func armTimeout() {
        timeout?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.disconnect(); self?.finish(nil,"Printer timed out. Check the label before retrying.") }
        timeout = work; DispatchQueue.main.asyncAfter(deadline:.now()+15,execute:work)
    }
    func disconnect() {
        central?.stopScan(); characteristic = nil
        if let p = printer { central?.cancelPeripheralConnection(p) }
        printer = nil
    }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.host == "local", let body = message.body as? [String:Any], let op = body["op"] as? String else { replyHandler(nil,"Invalid request"); return }
        if op == "estimate" { presentEstimate(body, reply: replyHandler); return }
        if op == "scan" { openLiveScanner(continuous: body["continuous"] as? Bool ?? false, replyHandler); return }
        if op == "disconnect" { disconnect(); finish(nil,"Cancelled"); replyHandler(true,nil); return }
        guard pending == nil else { replyHandler(nil,"Wait for the current operation"); return }
        pending = replyHandler; armTimeout()
        switch op {
        case "choose":
            if central == nil { central = CBCentralManager(delegate:self,queue:.main) }
            else { beginScan() }
        case "connect":
            guard let id = body["id"] as? String, let uuid = UUID(uuidString:id), let p = devices[uuid] else { finish(nil,"Find the printer again"); return }
            printer = p; p.delegate = self; central.connect(p)
        case "write":
            guard let p = printer, p.state == .connected, let c = characteristic, let values = body["bytes"] as? [UInt8], !values.isEmpty, values.count <= 20 else { finish(nil,"Printer disconnected or invalid packet"); return }
            if c.properties.contains(.write) { p.writeValue(Data(values),for:c,type:.withResponse) }
            else if p.canSendWriteWithoutResponse { p.writeValue(Data(values),for:c,type:.withoutResponse); finish(true) }
            else { finish(nil,"Printer buffer busy. Reconnect before retrying.") }
        default: finish(nil,"Unknown printer operation")
        }
    }
    func centralManagerDidUpdateState(_ central: CBCentralManager) { if pending != nil { beginScan() } }
    func beginScan() {
        guard central.state == .poweredOn else { if central.state != .unknown { finish(nil,"Enable Bluetooth and allow access in Settings.") }; return }
        devices.removeAll(); central.scanForPeripherals(withServices:nil)
        DispatchQueue.main.asyncAfter(deadline:.now()+4) { [weak self] in
            guard let self = self, self.pending != nil else { return }
            self.central.stopScan()
            let alert = UIAlertController(title:"Choose your printer",message:"Select your POSIFLOW 58D.",preferredStyle:.alert)
            for p in self.devices.values.sorted(by:{($0.name ?? "") < ($1.name ?? "")}) {
                alert.addAction(UIAlertAction(title:p.name ?? p.identifier.uuidString,style:.default){ _ in self.finish(["id":p.identifier.uuidString,"name":p.name ?? "Printer"]) })
            }
            alert.addAction(UIAlertAction(title:"Cancel",style:.cancel){ _ in self.finish(nil,"No printer selected") })
            self.timeout?.cancel(); self.present(alert,animated:true)
        }
    }
    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String:Any], rssi RSSI: NSNumber) { devices[peripheral.identifier] = peripheral }
    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) { peripheral.discoverServices(endpoints.keys.map { CBUUID(string:$0) }) }
    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) { finish(nil,error?.localizedDescription ?? "Could not connect") }
    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        if printer === peripheral { characteristic = nil; printer = nil; finish(nil,"Printer disconnected"); web.evaluateJavaScript("window.dispatchEvent(new Event('native-printer-disconnected'))") }
    }
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard error == nil, let services = peripheral.services, !services.isEmpty else { disconnect(); finish(nil,"No supported printer service"); return }
        for service in services { if let id = endpoints[service.uuid.uuidString.uppercased()] { peripheral.discoverCharacteristics([CBUUID(string:id)],for:service) } }
    }
    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard characteristic == nil, error == nil else { return }
        if let c = service.characteristics?.first(where:{$0.properties.contains(.write) || $0.properties.contains(.writeWithoutResponse)}) { characteristic = c; finish(true) }
    }
    func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) { finish(error == nil ? true : nil,error?.localizedDescription) }
}
