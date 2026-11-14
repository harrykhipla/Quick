import UIKit
import VisionKit
import AVFoundation

/// Keeps Apple's recognition session open while the calculator validates each read.
final class LiveTagScanner: UIViewController, DataScannerViewControllerDelegate {
    let reader = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.qr, .code128])],
        qualityLevel: .balanced, recognizesMultipleItems: false, isHighFrameRateTrackingEnabled: false,
        isPinchToZoomEnabled: true, isGuidanceEnabled: true, isHighlightingEnabled: true)
    var applyTag: ((String, @escaping (String?) -> Void) -> Void)?
    var continuous = false
    private let readout = UITextView()
    private let status = UILabel()
    private let feedback = UINotificationFeedbackGenerator()
    private var chime: AVAudioPlayer?
    private var visible = Set<String>()
    private var absentSince = [String: TimeInterval]()
    private var queue = [String]()
    private var applying = false
    private var running = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        addChild(reader)
        reader.view.frame = view.bounds
        reader.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(reader.view)
        reader.didMove(toParent: self)
        reader.delegate = self
        navigationItem.title = "Scan jewellery tags"
        navigationItem.rightBarButtonItem = UIBarButtonItem(barButtonSystemItem: .done, target: self, action: #selector(close))
        status.text = "Point at one jewellery tag"
        status.numberOfLines = 2
        status.textAlignment = .center
        status.textColor = .white
        status.backgroundColor = UIColor.black.withAlphaComponent(0.75)
        status.layer.cornerRadius = 12
        status.clipsToBounds = true
        status.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(status)
        NSLayoutConstraint.activate([status.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 12),
            status.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -12),
            status.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -8),
            status.heightAnchor.constraint(greaterThanOrEqualToConstant: 48)])
        if continuous {
            reader.view.translatesAutoresizingMaskIntoConstraints = false
            readout.translatesAutoresizingMaskIntoConstraints = false
            readout.isEditable = false
            readout.backgroundColor = .systemBackground
            readout.textColor = .label
            readout.font = .preferredFont(forTextStyle: .body)
            readout.textContainerInset = UIEdgeInsets(top: 14, left: 16, bottom: 14, right: 16)
            readout.text = "Waiting for a tag"
            view.addSubview(readout)
            let area = view.safeAreaLayoutGuide
            NSLayoutConstraint.activate([
                reader.view.topAnchor.constraint(equalTo: area.topAnchor),
                reader.view.leadingAnchor.constraint(equalTo: area.leadingAnchor),
                reader.view.trailingAnchor.constraint(equalTo: area.trailingAnchor),
                reader.view.heightAnchor.constraint(equalTo: area.heightAnchor, multiplier: 0.44),
                readout.topAnchor.constraint(equalTo: reader.view.bottomAnchor),
                readout.leadingAnchor.constraint(equalTo: area.leadingAnchor),
                readout.trailingAnchor.constraint(equalTo: area.trailingAnchor),
                readout.bottomAnchor.constraint(equalTo: status.topAnchor, constant: -4)
            ])
        }
        if let url = Bundle.main.url(forResource: "scan", withExtension: "wav", subdirectory: "Web") {
            chime = try? AVAudioPlayer(contentsOf: url)
            chime?.prepareToPlay()
        }
        NotificationCenter.default.addObserver(self, selector: #selector(pauseScan), name: UIApplication.willResignActiveNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(resumeScan), name: UIApplication.didBecomeActiveNotification, object: nil)
    }
    override func viewDidAppear(_ animated: Bool) { super.viewDidAppear(animated); resumeScan() }
    override func viewWillDisappear(_ animated: Bool) { super.viewWillDisappear(animated); pauseScan() }
    @objc private func close() { pauseScan(); dismiss(animated: true) }
    @objc private func pauseScan() { running = false; reader.stopScanning(); queue.removeAll() }
    @objc private func resumeScan() {
        guard viewIfLoaded?.window != nil, !running, !isBeingDismissed else { return }
        do { try reader.startScanning(); running = true; feedback.prepare() }
        catch { status.text = "Camera unavailable. Tap Done and try again." }
    }
    func dataScanner(_ dataScanner: DataScannerViewController, becameUnavailableWithError error: DataScannerViewController.ScanningUnavailable) {
        pauseScan(); status.text = "Camera unavailable. Tap Done and try again."
    }
    func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) { observe(allItems) }
    func dataScanner(_ dataScanner: DataScannerViewController, didUpdate updatedItems: [RecognizedItem], allItems: [RecognizedItem]) { observe(allItems) }
    func dataScanner(_ dataScanner: DataScannerViewController, didRemove removedItems: [RecognizedItem], allItems: [RecognizedItem]) { observe(allItems) }
    private func observe(_ items: [RecognizedItem]) {
        guard running else { return }
        let now = ProcessInfo.processInfo.systemUptime
        let codes = Set(items.compactMap { item -> String? in
            if case .barcode(let b) = item { return b.payloadStringValue }; return nil
        })
        for code in visible.subtracting(codes) { absentSince[code] = now }
        for code in codes.subtracting(visible) where code.utf8.count <= 2048 {
            if now - (absentSince[code] ?? -100) >= 1 { queue.append(code) }
        }
        absentSince = absentSince.filter { now - $0.value < 1 && !codes.contains($0.key) }
        visible = codes
        drain()
    }
    private func drain() {
        guard running, !applying, !queue.isEmpty, let applyTag = applyTag else { return }
        applying = true
        applyTag(queue.removeFirst()) { [weak self] name in
            guard let self = self else { return }
            self.applying = false
            guard self.running else { return }
            if let name = name {
                self.status.text = self.continuous ? "Tag read. Ready for the next piece." : "Scanned · " + name
                if self.continuous { self.readout.text = name; self.readout.setContentOffset(.zero, animated: false) }
                self.feedback.notificationOccurred(.success)
                self.chime?.currentTime = 0
                self.chime?.play()
                self.feedback.prepare()
                if !self.continuous { self.close(); return }
            } else { self.status.text = "Unrecognised jewellery tag. Try the next one." }
            self.drain()
        }
    }
}

extension CalculatorController {
    func openLiveScanner(continuous: Bool, _ reply: @escaping (Any?, String?) -> Void) {
        guard DataScannerViewController.isSupported else { reply(nil,"Live scanning is unavailable on this iPhone. Choose a photo below."); return }
        AVCaptureDevice.requestAccess(for: .video) { allowed in
            DispatchQueue.main.async {
                guard allowed, DataScannerViewController.isAvailable else { reply(nil,"Allow Camera in Settings or choose a photo below."); return }
                guard self.presentedViewController == nil else { reply(nil,"Close the current dialog first."); return }
                let scanner = LiveTagScanner()
                scanner.continuous = continuous
                scanner.applyTag = { [weak self] code, complete in
                    guard let self = self else { complete(nil); return }
                    self.web.callAsyncJavaScript("return window.applyNativeTag(code)", arguments: ["code": code], in: nil, in: .page) { result in
                        if case .success(let value) = result { complete(value as? String) } else { complete(nil) }
                    }
                }
                let nav = UINavigationController(rootViewController: scanner)
                nav.modalPresentationStyle = .fullScreen
                self.present(nav,animated:true) { reply(true,nil) }
            }
        }
    }
}
