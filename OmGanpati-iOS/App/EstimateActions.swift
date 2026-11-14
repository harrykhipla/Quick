import UIKit
import MessageUI

extension CalculatorController: MFMailComposeViewControllerDelegate, MFMessageComposeViewControllerDelegate, UIDocumentPickerDelegate {
    func presentEstimate(_ body: [String: Any], reply: @escaping (Any?, String?) -> Void) {
        guard presentedViewController == nil, let action = body["action"] as? String else {
            reply(nil, "Close the current sheet first."); return
        }
        if action == "sms" {
            guard MFMessageComposeViewController.canSendText(), let text = body["text"] as? String else {
                reply(nil, "SMS is unavailable on this device."); return
            }
            let composer = MFMessageComposeViewController()
            composer.messageComposeDelegate = self
            composer.body = text
            present(composer, animated: true) { reply("", nil) }
            return
        }
        guard let encoded = body["base64"] as? String, let pdf = Data(base64Encoded: encoded),
              pdf.starts(with: Data("%PDF-".utf8)), let filename = body["filename"] as? String,
              filename == (filename as NSString).lastPathComponent, filename.hasSuffix(".pdf") else {
            reply(nil, "Please generate the quotation PDF again."); return
        }
        if action == "print" {
            guard UIPrintInteractionController.isPrintingAvailable else {
                reply(nil, "Printing is unavailable on this device."); return
            }
            let printer = UIPrintInteractionController.shared
            let info = UIPrintInfo(dictionary: nil)
            info.jobName = filename
            info.outputType = .general
            printer.printInfo = info
            printer.printingItem = pdf
            let completion: (UIPrintInteractionController, Bool, Error?) -> Void = { _, _, error in
                reply(error == nil ? "" : nil, error?.localizedDescription)
            }
            if traitCollection.userInterfaceIdiom == .pad {
                printer.present(from: anchorRect, in: view, animated: true, completionHandler: completion)
            } else {
                printer.present(animated: true, completionHandler: completion)
            }
            return
        }
        if action == "email", MFMailComposeViewController.canSendMail() {
            let composer = MFMailComposeViewController()
            composer.mailComposeDelegate = self
            composer.setSubject("Om Ganpati Jewellers · Estimate Price Quotation")
            composer.addAttachmentData(pdf, mimeType: "application/pdf", fileName: filename)
            present(composer, animated: true) { reply("", nil) }
            return
        }
        guard ["whatsapp", "email", "save"].contains(action) else { reply(nil, "Unknown action."); return }
        do {
            let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let file = folder.appendingPathComponent(filename)
            try pdf.write(to: file, options: .atomic)
            if action == "save" {
                estimateExportFolder = folder
                let picker = UIDocumentPickerViewController(forExporting: [file], asCopy: true)
                picker.delegate = self
                present(picker, animated: true) { reply("", nil) }
            } else {
                let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
                sheet.popoverPresentationController?.sourceView = view
                sheet.popoverPresentationController?.sourceRect = anchorRect
                sheet.completionWithItemsHandler = { _, _, _, _ in try? FileManager.default.removeItem(at: folder) }
                present(sheet, animated: true) { reply("", nil) }
            }
        } catch { reply(nil, error.localizedDescription) }
    }
    private var anchorRect: CGRect {
        CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
    }
    func mailComposeController(_ controller: MFMailComposeViewController, didFinishWith result: MFMailComposeResult, error: Error?) {
        controller.dismiss(animated: true)
    }
    func messageComposeViewController(_ controller: MFMessageComposeViewController, didFinishWith result: MessageComposeResult) {
        controller.dismiss(animated: true)
    }
    private func cleanExport() {
        if let folder = estimateExportFolder { try? FileManager.default.removeItem(at: folder) }
        estimateExportFolder = nil
    }
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { cleanExport() }
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { cleanExport() }
}
