// Receipt texts for the parser tests: written to look like what Tesseract returns from real
// Malaysian receipts (kopitiam, mamak, campus café, supermarket, 7-Eleven, food delivery),
// including the usual OCR slips. Shop names are generic or invented.
module.exports = {
  kopitiam: `KEDAI KOPI SRI MAJU
No 12, Jalan SS2/24, Petaling Jaya
Tel: 03-7877 1234
Date: 14/10/2026  08:12   Table 5
NASI LEMAK AYAM        1     8.50
2 x KOPI O AIS @2.20         4.40
ROTI BAKAR KAYA        1     3.80
SUBTOTAL                    16.70
SST 6%                       1.00
ROUNDING ADJ                -0.05
TOTAL                 RM    17.65
CASH                        20.00
CHANGE                       2.35
Terima kasih, sila datang lagi`,
  noisyMamak: `RESTORAN NASI KANDAR PELITA BARU
Inv No: 004512    15-10-26 21:40
R0TI CANAI 2 1.6O 3.2O
TEH TARIK         2.8O
MEE G0RENG MAMAK  8.5O
MAGGI G0RENG     7.S0
Sub Total        22.00
Service Tax 6%    1.32
Rounding         -0.02
T0TAL           23.30
TUNAI           50.00
BAKI            26.70`,
  campus: `CAFE KOLEJ KEDIAMAN 3
16/10/2026 12:31
Menu Rahmah Set   5.00
Air Sirap Ais     1.50
Jumlah RM 6.50
Terima Kasih`,
  supermarket: `MYDIN MART BANGI
SST ID: W10-1808-31000000
Receipt No: 77123  17/10/2026 18:05
BERAS TEMPATAN 5KG   13.00 Z
TELUR GRED B 10BIJI   4.20 Z
SAYUR CAMPUR 500G     3.90
KANGKUNG 1 IKAT       2.00
TAUHU 2PCS            2.40
PISANG BERANGAN 1KG   5.50
GARDENIA WHOLEMEAL    4.30
MILO 3IN1 18S        16.90 SR
  DISCOUNT           -2.00
Total Incl. SST      50.20
Rounding Adj          0.00
Total Payable        50.20
VISA ************1234 50.20
Item Count: 8`,
  sevenEleven: `7-ELEVEN MALAYSIA
Store 1234 Seksyen 13
2 x Mee Cup Ayam    @3.20   6.40
100PLUS 500ML               2.60
Total RM                    9.00
TNG eWallet                 9.00`,
  delivery: `Order summary
Chicken Rice (Roasted)   x1   RM10.90
Teh O Ais Limau          x1   RM 3.50
Subtotal                       RM14.40
Delivery fee                   RM 4.99
Small order fee                RM 2.00
Service fee                    RM 0.50
Total                          RM21.89`,
  priceNextLine: `KANTIN FAKULTI
17/10/26
NASI CAMPUR 2 SAYUR
1 IKAN GORENG
              7.00
AIR KOSONG    0.50
TOTAL         7.50`,
  garbage: `~~ ## ..
lorem ipsum
1234 5678`
};
