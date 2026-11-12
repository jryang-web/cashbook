import assert from 'node:assert/strict';
import { parseInvoiceLeft, parseInvoiceItems, invoiceNote } from '../src/invoice-qr.js';

// Example from the Ministry of Finance QR specification: 102/05/23, total 0x154 = 340.
const raw = 'AB1122334410205239999000001440000015400000000001234567ydXZt4LAN1UHN/j1juVcRA==:**********:3:3:0:乾電池:1:105:';
const left = parseInvoiceLeft(raw);
assert.deepEqual([left.number, left.date, left.total], ['AB11223344', '2013-05-23', 340]);
assert.deepEqual(parseInvoiceItems(left.tail, '**口罩:1:210:牛奶:1:25'), ['乾電池 ×1', '口罩 ×1', '牛奶 ×1']);
assert.match(invoiceNote(left, '**口罩:1:210:牛奶:1:25'), /乾電池.*口罩.*牛奶/);
assert.equal(parseInvoiceLeft('**口罩:1:210'), null);
assert.equal(parseInvoiceLeft(raw.slice(0, 10) + '1020230' + raw.slice(17)), null);
assert.equal(parseInvoiceLeft(raw.slice(0, 29) + 'FFFFFFFF' + raw.slice(37)), null);
console.log('Invoice QR parser checks passed');
