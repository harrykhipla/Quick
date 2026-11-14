# Om Ganpati Jewellers — iPhone & iPad source package

Bundled calculator with the purple interface, purity rates, multiple embellishments, net weight deductions, QR payloads, HUID photo reader, horizontal 58 mm labels and optional narrow tags. Calculations and label generation work from bundled files. Native CoreBluetooth replaces the browser Bluetooth API; Bluefy is not required.

## Install using a Mac
1. Install Xcode from Apple's Mac App Store. Open it once to finish setup.
2. Double-click OmGanpati.xcodeproj in the extracted folder.
3. Select the OmGanpati target → Signing & Capabilities → select your Apple team. Change the bundle identifier if needed.
4. Connect your iPhone, select it as the run destination and press Run. Complete any device trust / Developer Mode prompts on the phone.
5. In Create tag choose 58 mm Horizontal, check the sticker height, Find printer, allow Bluetooth and select POSIFLOW. Close other printer apps first. Print the small OK test, confirm its appearance, then test one tag and scan its QR.

## Verification and limitations
This is source code, not a signed IPA or App Store/TestFlight release. The Linux build environment has no Apple SDK or Xcode, so the Swift target has NOT been compiled or run on an iPhone. Native Bluetooth requires hardware testing. Do not treat completed BLE writes as confirmation of a physical print. No automatic print retry is implemented.

The existing web calculator's 46 tests passed before packaging; the native bridge is new and unverified on hardware. The corrected printer encoding is retained unchanged. Physical sticker height defaults to 25 mm and is editable; 58 mm is the roll width.

HUID photo import and manual entry remain available; BIS verification is not included. Browser Print and Save PNG in the embedded web interface are not yet integrated with native iOS print/share sheets: use Bluetooth Print for tags. Test photo import and the local OCR worker on a device before operational use. No cloud sync or automatic download of website updates is included. Future app updates must replace the bundled Web folder and retain the native Bluetooth adapter.

This starter requires app icons, signing, device QA, privacy review and distribution configuration before App Store submission. No Apple credentials are included. Local data stays on the device; no analytics or remote account is added.

## Price checks and quotations
Scan a tag opens the calculator result after one valid scan. Continuous scan keeps the native camera running and shows read-only details beneath it, including price before GST. Tap Done to exit.

For a customer quotation, enter or scan the item in the calculator and tap Quote Estimate below the breakdown. The app generates the A5 PDF on the device. Print PDF opens the system print interface. Save PDF opens Files. WhatsApp PDF opens the share sheet, and Email PDF opens Mail with the PDF attached or the share sheet if Mail is unavailable. SMS opens a plain-text draft. Check each action on the intended iPhone before shop use.
