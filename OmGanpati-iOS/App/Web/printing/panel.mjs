import { BluetoothPrinter } from './bluetooth.mjs';
import { labelSetJob, calibrationJob, printerCheckJob } from './label-command.mjs';
const byId = id => document.getElementById(id);
const remember = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
const recalled = key => { try { return localStorage.getItem(key); } catch { return null; } };

export function setupPrinter(getRaster, onBusy = () => {}) {
  const select = byId('printer-list'), connect = byId('connect-printer'), disconnect = byId('disconnect-printer');
  const print = byId('print-tag'), test = byId('printer-test'), calibrate = byId('printer-align');
  const status = byId('printer-status'), progress = byId('printer-progress');
  const check = byId('printer-check'), accept = byId('printer-accept');
  let testSent = false;
  const verifiedDevices = new Set();
  const verificationKey = () => 'ogj-58d-t8d-v2-' + (printer.device?.id || '');
  const verified = () => printer.connected && (verifiedDevices.has(verificationKey()) || recalled(verificationKey()) === 'yes');
  const copies = byId('printer-copies'), offset = byId('printer-offset'), reverse = byId('printer-reverse');
  let usable = false, working = false, choosing = false;
  let layout='rectangle';
  const offsetKey=()=>layout==='label'?'ogj-printer-offset':'ogj-printer-rectangle-offset';
  const reverseKey=()=>layout==='label'?'ogj-printer-reverse':'ogj-printer-rectangle-reverse';
  let preferred = recalled('ogj-printer-id') || '';
  const printer = new BluetoothPrinter(undefined, event => {
    update();
    if (event === 'disconnected' && !working && !choosing) message('Printer disconnected. Connect it to print.');
  });
  function message(text, error = false) { status.textContent = text; status.dataset.error = String(error); }
  function update() {
    const busy = working || choosing || printer.connecting || printer.busy;
    const chosen = select.value || preferred;
    const options = [new Option(printer.devices.size ? 'Add another printer…' : 'No saved printer — add one', '')];
    for (const [id, device] of printer.devices) options.push(new Option(device.name || 'Bluetooth printer', id));
    select.replaceChildren(...options);
    select.value = printer.devices.has(chosen) ? chosen : '';
    select.disabled = busy || !printer.supported;
    connect.disabled = busy || !printer.supported || (printer.connected && select.value === printer.device.id);
    connect.textContent = choosing || printer.connecting ? 'Connecting…' : select.value ? 'Connect' : 'Find printer';
    disconnect.hidden = !printer.connected && !busy;
    disconnect.textContent = working || choosing ? 'Cancel connection / transfer' : 'Disconnect';
    print.disabled = test.disabled = busy || !usable || !verified();
    check.disabled = busy || !printer.connected;
    accept.hidden = !testSent || verified();
    accept.disabled = busy || !printer.connected;
    byId('printer-check-panel').hidden = verified();
    calibrate.disabled = busy || !verified();
    copies.disabled = offset.disabled = reverse.disabled = busy;
    byId('printer-state').textContent = printer.connected ? 'Connected' : busy ? 'Connecting / sending' : 'Not connected';
    byId('printer-state').dataset.connected = String(printer.connected);
    byId('printer-name').textContent = printer.connected ? printer.device.name || 'Bluetooth printer' : 'POSIFLOW 58D';
    byId('printer-format-note').hidden = usable;
    onBusy(busy);
  }
  async function doConnect() {
    testSent = false; choosing = true; update(); message('Choose your POSIFLOW printer. Turn it on and close MyLabel first.');
    try {
      if (select.value) await printer.connect(select.value); else await printer.choose();
      preferred = printer.device.id; remember('ogj-printer-id', preferred);
      select.value = preferred;
      message(verified() ? 'Bluetooth connected. Ready to print using the corrected 58D driver.' : 'Connected. Restart the printer if it printed random characters, reconnect, then tap Print small test.');
    } catch (error) {
      message(error.name === 'NotFoundError' ? 'No printer selected. Tap Find printer to try again.' : error.name === 'SecurityError' || error.name === 'NotAllowedError' ? 'Bluetooth permission was not granted. Allow Bluetooth for this website and try again.' : error.message, error.name !== 'NotFoundError');
    } finally { choosing = false; update(); }
  }
  async function send(kind) {
    if (working || choosing || !printer.connected) return;
    if (kind !== 'check' && !verified()) return;
    if (kind !== 'check' && kind !== 'align' && !usable) return;
    if (kind === 'check') testSent = false;
    working = true; update(); progress.hidden = false; progress.value = 0;
    message(kind === 'align' ? 'Feeding to the next label edge…' : 'Preparing the printer image…');
    try {
      let job;
      if (kind === 'check') job = printerCheckJob();
      else if (kind === 'align') job = calibrationJob();
      else {
        const x = Number(offset.value), count = kind === 'test' ? 1 : Number(copies.value);
        const maxOffset=layout==='label'?33:0;
        if (!offset.value || !Number.isFinite(x) || x < 0 || x > maxOffset || !Number.isInteger(x * 8)) throw new Error(`Use an across-paper position from 0 to ${maxOffset} mm, in steps of 0.125 mm.`);
        if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error('Choose 1 to 10 copies.');
        const rasters = await getRaster(reverse.checked);
        job = labelSetJob(Array.isArray(rasters) ? rasters : [rasters],{x:Math.round(x * 8),copies:count});
        remember(offsetKey(), String(x)); remember(reverseKey(), String(reverse.checked));
      }
      await printer.send(job, value => {
        progress.value = value;
        status.textContent = `Sending to ${printer.device.name || 'printer'}… ${value}%`;
      });
      if (kind === 'check') {
        testSent = true;
        message('Small test sent. It should show OK inside a rectangle. Only tap Test looks correct if that image printed cleanly. If not, stop and share a photo of the test and the printer self-test page.');
      } else message(kind === 'align' ? 'Feed command sent. Check the next label edge.' : 'Tag data sent. Check the printed label and scan its QR code to confirm it reads correctly.');
    } catch (error) { testSent = false; verifiedDevices.delete(verificationKey()); remember(verificationKey(), ''); message(error.message, true); }
    finally { working = false; progress.hidden = true; update(); }
  }
  check.addEventListener('click', () => send('check'));
  accept.addEventListener('click', () => {
    if (!testSent || !printer.connected || working) return;
    verifiedDevices.add(verificationKey()); remember(verificationKey(), 'yes'); update();
    message('Test confirmed. Check the selected label size and test one tag before multiple copies.');
  });
  select.addEventListener('change', () => { testSent = false; preferred = select.value; printer.disconnect(); update(); });
  connect.addEventListener('click', doConnect);
  disconnect.addEventListener('click', () => { printer.disconnect(); message('Connection or transfer cancelled. Check the printer before printing again.'); });
  print.addEventListener('click', () => send('print'));
  test.addEventListener('click', () => send('test'));
  calibrate.addEventListener('click', () => send('align'));
  function setLayout(format) {
    if(working || choosing) return;
    layout=format;
    const strip=format==='label';
    const stored=Number(recalled(offsetKey())??(strip?16.5:0));
    offset.max=String(strip?33:0);
    offset.value=String(Number.isFinite(stored)&&stored>=0&&stored<=Number(offset.max)&&Number.isInteger(stored*8)?stored:(strip?16.5:0));
    reverse.checked=recalled(reverseKey())==='true';
    byId('printer-position').hidden=!strip;
    byId('printer-paper-help').textContent=strip
      ?'For narrow jewellery stock only: load 15 mm across the printer and 100 mm in the feed direction. Keep the fastening tail blank.'
      :'Horizontal printing on the 58 mm roll. Set Label height to the height of one sticker, without the gap. The design is centred in the printable area.';
  }
  setLayout('rectangle');
  byId('bluetooth-help').hidden = printer.supported;
  if (!printer.supported) message('This browser cannot connect to Bluetooth printers. Open this calculator in Bluefy on iPhone/iPad, or Chrome on Android.');
  else message('Corrected POSIFLOW 58D driver. Connect and check a small test before your first full tag.');
  update();
  return {
    setLayout,
    setReady(ready, reason = '') {
      usable = ready;
      byId('printer-format-note').textContent = reason || 'Choose the horizontal sticker or narrow jewellery label for direct printing. Code-only formats can be saved or printed through the browser.';
      update();
    },
    open() { printer.remembered(); },
    close() { if (working || choosing) printer.disconnect(); },
    get busy() { return working || choosing; }
  };
}
