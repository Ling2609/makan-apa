# Vendored libraries (copied from npm so the app works offline, no CDN)

| File | Package | Version | Licence | Size |
|---|---|---|---|---|
| tesseract/tesseract.min.js | tesseract.js | 5.1.1 | Apache-2.0 | 66 KB |
| tesseract/worker.min.js | tesseract.js | 5.1.1 | Apache-2.0 | 121 KB |
| tesseract/tesseract-core-lstm.wasm.js | tesseract.js-core (LSTM-only build, WASM inlined) | 5.1.1 | Apache-2.0 | 3.8 MB |
| tesseract/lang/eng.traineddata.gz | @tesseract.js-data/eng (4.0.0_best_int) | 1.0.0 | Apache-2.0 | 2.8 MB |
| qr/qrcode.js | qrcode-generator | 1.4.4 | MIT | 55 KB |
| qr/jsQR.js | jsqr | 1.4.0 | Apache-2.0 | 251 KB |

Total about 7.1 MB. None of it loads until a student opens the receipt scanner (OCR) or the
class/stall share screens (QR). The service worker caches each file the first time it is used,
so the scanner works offline after its first use. Licence texts are next to the files.

To update: `npm i tesseract.js@5 tesseract.js-core@5 @tesseract.js-data/eng qrcode-generator jsqr`
in a scratch folder and copy the same files over.
