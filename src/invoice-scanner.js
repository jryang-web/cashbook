import { parseInvoiceLeft, invoiceNote } from './invoice-qr.js';

export async function openInvoiceScanner(form, onClose) {
  const layer = document.createElement('div');
  layer.className = 'modal-layer scan-layer';
  layer.innerHTML = `<div class="shade"></div><section class="sheet scan-sheet" role="dialog" aria-modal="true" aria-label="掃描電子發票">
    <div class="handle"></div><div class="sheet-head"><h2>掃描電子發票</h2><button type="button" class="scan-close" aria-label="關閉">×</button></div>
    <p class="scan-help">先對準左側 QR Code 取得日期與含稅總額；再對準右側 QR Code 可補上品項。</p>
    <video class="scan-video" autoplay muted playsinline></video>
    <p class="scan-status" role="status">正在準備相機…</p>
    <label class="scan-file-label">無法使用相機？拍照或選擇圖片<input class="scan-file" type="file" accept="image/*" capture="environment"></label>
    <div class="scan-result" hidden><strong>辨識結果，請確認後代入</strong><p class="scan-fields"></p>
      <button type="button" class="primary scan-apply">代入表單</button><button type="button" class="secondary scan-retry">重新掃描</button></div>
    <p class="scan-help">不會自動儲存。代入後仍可手動修改；照片不會上傳。</p>
  </section>`;
  document.body.append(layer);
  const video = layer.querySelector('video');
  const status = layer.querySelector('.scan-status');
  const result = layer.querySelector('.scan-result');
  const fields = layer.querySelector('.scan-fields');
  let stream, timer, disposed = false, left = null, right = '', detector, jsQR;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const stop = () => { clearTimeout(timer); stream?.getTracks().forEach(track => track.stop()); stream = null; video.srcObject = null; };
  const close = () => { disposed = true; stop(); layer.remove(); onClose?.(); };
  layer.querySelector('.scan-close').onclick = close;
  layer.querySelector('.shade').onclick = close;
  const show = () => {
    result.hidden = false;
    fields.textContent = `日期：${left.date}　含稅總額：NT$ ${left.total.toLocaleString('zh-TW')}\n備註：${invoiceNote(left, right)}${right ? '' : '\n可繼續掃右碼補充品項，或先代入。'}`;
    status.textContent = right ? '左右碼已讀取，請核對資料。' : '已讀取左碼。可繼續掃右碼。';
  };
  const consume = raw => {
    if (disposed || !raw) return;
    const parsed = parseInvoiceLeft(raw);
    if (parsed) { if (left?.number !== parsed.number) right = ''; left = parsed; show(); }
    else if (raw.startsWith('**') && left && !right) { right = raw; show(); }
  };
  async function decode(source) {
    if (detector) {
      const codes = await detector.detect(source);
      codes.filter(x => x.format === 'qr_code').forEach(x => consume(x.rawValue));
      if (codes.length && !codes.some(x => x.rawValue?.includes('�'))) return;
    }
    if (!jsQR) return;
    canvas.width = source.videoWidth || source.naturalWidth;
    canvas.height = source.videoHeight || source.naturalHeight;
    if (!canvas.width || !canvas.height) return;
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const qr = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' });
    if (qr) {
      // Some invoices encode Chinese item names in Big5; retain the QR bytes when possible.
      let text = qr.data;
      if (qr.binaryData?.length && (text.includes('�') || /:\d+:\d+:0:/.test(text))) {
        try { text = new TextDecoder('big5').decode(new Uint8Array(qr.binaryData)); } catch { /* retain decoder text */ }
      }
      consume(text);
    }
  }
  async function scanLoop() {
    if (disposed || !stream) return;
    try { if (video.readyState >= 2) await decode(video); }
    catch { status.textContent = '辨識失敗，請調整光線或改用拍照。'; }
    if (!disposed && stream) timer = setTimeout(scanLoop, 250);
  }
  layer.querySelector('.scan-apply').onclick = () => {
    if (!left) return;
    form.closest('.sheet')?.querySelector('[data-kind="expense"]')?.click();
    form.elements.namedItem('amount').value = String(left.total);
    form.elements.namedItem('date').value = left.date;
    form.elements.namedItem('note').value = invoiceNote(left, right);
    close();
  };
  layer.querySelector('.scan-retry').onclick = () => {
    left = null; right = ''; result.hidden = true; status.textContent = '請對準左側 QR Code。';
  };
  layer.querySelector('.scan-file').onchange = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      await decode(bitmap);
      bitmap.close();
      if (!left) status.textContent = '尚未辨識到左側 QR Code，請重拍清晰影像。';
    } catch { status.textContent = '圖片無法辨識，請重拍或手動輸入。'; }
    e.target.value = '';
  };
  try {
    try { ({ default: jsQR } = await import('https://esm.sh/jsqr@1.4.0')); } catch { /* native detector may still work */ }
    try {
      if ('BarcodeDetector' in window && (await BarcodeDetector.getSupportedFormats()).includes('qr_code'))
        detector = new BarcodeDetector({ formats: ['qr_code'] });
    } catch { /* use jsQR */ }
    if (!detector && !jsQR) throw new Error('QR 解碼器不可用');
    if (disposed) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('相機不可用');
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
    if (disposed) { stop(); return; }
    video.srcObject = stream;
    await video.play();
    status.textContent = '請對準左側 QR Code。';
    scanLoop();
  } catch {
    status.textContent = '相機無法開啟。可拍照選取圖片，或返回手動輸入。';
  }
}
