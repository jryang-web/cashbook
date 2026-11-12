// Taiwan electronic invoice proof QR codes: left fixed header, optional item tail on both codes.
export function parseInvoiceLeft(raw) {
  if (typeof raw !== 'string' || raw.length < 77 || raw.startsWith('**')) return null;
  const number = raw.slice(0, 10);
  const roc = raw.slice(10, 17);
  const totalHex = raw.slice(29, 37);
  if (!/^[A-Z]{2}\d{8}$/.test(number) || !/^\d{7}$/.test(roc) || !/^[\da-fA-F]{8}$/.test(totalHex)) return null;
  const year = Number(roc.slice(0, 3)) + 1911;
  const month = Number(roc.slice(3, 5));
  const day = Number(roc.slice(5, 7));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  const total = parseInt(totalHex, 16);
  if (!Number.isSafeInteger(total) || total < 1 || total > 1_000_000_000) return null;
  const tailStart = raw.indexOf(':', 77);
  return { number, date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, total,
    tail: tailStart >= 77 && tailStart <= 80 ? raw.slice(tailStart) : '' };
}

export function parseInvoiceItems(leftTail, rightRaw = '') {
  // The optional segment starts with :merchant-use:encoded-count:total-count:encoding:.
  // A right code starts with ** and continues the same payload, potentially mid-item.
  if (!leftTail?.startsWith(':')) return [];
  const parts = leftTail.slice(1).split(':');
  if (parts.length < 4 || !/^\d+$/.test(parts[1]) || !/^\d+$/.test(parts[2])) return [];
  const count = Number(parts[1]);
  if (count < 1 || count > 100) return [];
  const combined = parts.slice(4).join(':') + (rightRaw.startsWith('**') ? rightRaw.slice(2) : '');
  const fields = combined.split(':');
  const items = [];
  for (let i = 0; i < Math.min(count, 30); i++) {
    const [name, quantity, price] = fields.slice(i * 3, i * 3 + 3);
    if (!name?.trim() || !quantity || !price || !/^\d+(?:\.\d+)?$/.test(quantity) || !/^\d+(?:\.\d+)?$/.test(price)) break;
    items.push(`${name.trim()} ×${quantity}`);
  }
  return items;
}

export function invoiceNote(left, right = '') {
  const items = parseInvoiceItems(left.tail, right);
  const prefix = `發票 ${left.number}`;
  const suffix = items.length ? `｜${items.join('、')}` : '';
  return (prefix + suffix).slice(0, 300);
}
