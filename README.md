# Fuyuha ImageTracer - Website

Website statis untuk mengubah gambar PNG/JPG/WEBP menjadi SVG langsung di browser. Tidak butuh backend, jadi cocok untuk di-deploy ke Vercel.

## Isi folder

- `index.html`: halaman utama. Sudah menyertakan pustaka imagetracerjs v1.2.6 (Unlicense) di dalamnya, jadi cukup satu file.

## Cara deploy ke Vercel

### Opsi 1: lewat dashboard (paling mudah)
1. Buat repositori GitHub baru, lalu upload `index.html` dan `README.md` ke root repositori.
2. Buka https://vercel.com/new dan import repositori tersebut.
3. Framework Preset pilih **Other**. Biarkan Build Command dan Output Directory kosong.
4. Klik **Deploy**.

### Opsi 2: lewat Vercel CLI
```bash
npm i -g vercel
cd imagetracer-web
vercel
```
Ikuti pertanyaan di terminal, lalu jalankan `vercel --prod` untuk produksi.

## Menjalankan lokal

Cukup buka `index.html` di browser (termasuk di aplikasi editor yang punya preview). Atau jalankan server sederhana:
```bash
npx serve .
```

## Catatan

- Gambar diproses di browser pengguna, tidak ada yang diunggah ke server.
- Ukuran proses dibatasi (400/800/1200 px) agar tidak lambat. Semakin besar, semakin detail tetapi lebih lambat.
- Jika ingin mengubah isi library, tambahkan `* Modified by FuyuhaArshi` di baris paling atas blok library di dalam `index.html`.
