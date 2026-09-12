# Sispema Auto Validator

Extension Chrome untuk membantu admin melakukan validasi ajuan Sispema secara lebih cepat dan terarah.

Extension ini menambahkan panel **Auto Validator** langsung pada halaman Sispema Unpam. Data ajuan diambil melalui API resmi yang digunakan aplikasi, kemudian dapat diproses secara bulk atau satu per satu.

## Fitur Utama

- Panel validator yang dapat dibuka dan ditutup dari tombol floating.
- Validasi bulk berdasarkan rentang halaman dan jumlah data per halaman.
- Validasi single berdasarkan ID ajuan.
- Dukungan beberapa jenis validasi:
  - Rekognisi Kegiatan
  - Luaran
  - Prestasi
  - Publikasi
- Filter berdasarkan:
  - Awalan NIM/UCR
  - Semester
  - Tahun kegiatan untuk rekognisi
  - Kategori luaran
  - Kategori publikasi
- Mode fetch terlebih dahulu untuk meninjau data sebelum validasi.
- Pencarian hasil fetch berdasarkan NIM atau nama ajuan.
- Tombol **Clear ID Ajuan** untuk menghapus hasil fetch dan mengambil ulang dengan filter berbeda.
- Statistik jumlah data diambil, lolos filter, dan berhasil divalidasi.
- Console log proses validasi.
- Token Bearer diisi otomatis dari `localStorage.access_token`.

## Instalasi di Chrome

1. Clone atau download repository ini.
2. Buka `chrome://extensions`.
3. Aktifkan **Developer mode**.
4. Klik **Load unpacked**.
5. Pilih folder project ini.
6. Buka atau refresh halaman Sispema Unpam.

Setelah extension aktif, tombol floating Auto Validator akan muncul di sisi kanan bawah halaman.

## Cara Menggunakan

### Validasi Bulk

1. Buka panel melalui tombol floating.
2. Pilih jenis validasi.
3. Jika memilih Luaran atau Publikasi, pilih kategori dari dropdown.
4. Atur `Page From`, `Page To`, dan `Per Page`.
5. Atur filter tambahan bila diperlukan.
6. Aktifkan **Auto-validasi langsung setelah fetch** untuk langsung memproses data.
7. Matikan opsi tersebut jika ingin meninjau hasil fetch terlebih dahulu.
8. Klik **Mulai Validasi**.

Jika hasil fetch sudah tampil, gunakan kolom pencarian untuk mempersempit daftar. Klik **Clear ID Ajuan** sebelum memilih kategori lain dan melakukan fetch ulang.

### Validasi Single

1. Buka tab **Single**.
2. Masukkan ID ajuan.
3. Klik tombol validasi.

## Filter Kategori

Untuk Luaran, extension mengirim parameter berikut ke API:

```text
id_kategori_luaran=KLU02
```

Untuk Publikasi:

```text
id_kategori_publikasi=KPU01
```

Nama yang tampil di dropdown berasal dari endpoint kategori, sedangkan ID hanya digunakan sebagai nilai parameter API.

## Endpoint API

| Kebutuhan          | Endpoint                        |
| ------------------ | ------------------------------- |
| Ajuan rekognisi    | `/api/rekognisi-kegiatan/ajuan` |
| Ajuan luaran       | `/api/luaran/ajuan`             |
| Kategori luaran    | `/api/luaran/kategori`          |
| Validasi luaran    | `/api/luaran/validasi`          |
| Ajuan publikasi    | `/api/publikasi/ajuan`          |
| Kategori publikasi | `/api/publikasi/kategori`       |
| Validasi publikasi | `/api/publikasi/validasi`       |
| Ajuan prestasi     | `/api/prestasi/ajuan`           |
| Validasi prestasi  | `/api/prestasi/validasi`        |

Semua endpoint digunakan pada host:

```text
https://sispema.unpam.ac.id
```

## Struktur Project

```text
.
├── content.js    # Panel iframe, komunikasi, fetch API, dan proses validasi
├── manifest.json # Konfigurasi Chrome Extension Manifest V3
├── panel.css     # Style panel validator
├── panel.html    # Tampilan panel validator
├── panel.js      # Interaksi panel dan konfigurasi pengguna
├── prestasi.js   # Tools khusus halaman validasi prestasi
└── README.md
```

## Token dan Keamanan

Extension membaca token dari:

```js
localStorage.getItem("access_token");
```

Prefix `__q_strn|` akan dihapus otomatis bila terdapat pada nilai token. Token juga disimpan di local storage extension untuk fallback konfigurasi.

Gunakan extension hanya pada lingkungan dan akun yang memiliki hak akses. Jangan membagikan token, screenshot console, atau data ajuan kepada pihak yang tidak berwenang.

## Troubleshooting

### Tombol extension tidak muncul

- Pastikan extension sudah di-**Reload** dari `chrome://extensions`.
- Refresh halaman Sispema setelah melakukan reload.
- Pastikan URL berada di `sispema.unpam.ac.id`.
- Periksa error pada Developer Tools halaman.

### Token kosong

- Pastikan sudah login di Sispema.
- Pastikan `localStorage` halaman memiliki key `access_token`.
- Tutup dan buka kembali panel setelah login.

### Kategori belum muncul

- Pastikan token masih valid.
- Refresh halaman setelah reload extension.
- Periksa koneksi ke endpoint kategori melalui Network tab.

## Status Project

Project ini dibuat untuk penggunaan internal pada aplikasi Sispema Unpam dan menggunakan Chrome Extension Manifest V3.
