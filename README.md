# ai-happy-01 — "The Berry"

Entri bounty make.fun: ilustrasi prosedural bergaya golden-hour — dua burung kecil berbagi satu buah beri di dahan berbunga saat matahari terbenam.

## Cara kerja

- `main.ts` menggambar seluruh adegan secara prosedural dengan pustaka standar Node.js saja — tanpa panggilan model dan tanpa jaringan. Hasilnya deterministik: setiap kali dijalankan akan menghasilkan gambar yang sama.
- Render dilakukan pada 1024×1024 (2× supersampling), lalu diperkecil menjadi PNG 512×512 di `entry.png`.
- Adegan berisi langit senja bergradasi, matahari terbenam, awan lavender, dahan berbunga, dua burung (satu sedang memetik buah beri, satu lagi menatapnya), plus bokeh lembut dan vignette.

## Menjalankan

```bash
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Membutuhkan Node.js 22 (atau yang lebih baru). Keluaran ditulis ke `entry.png` di `MAKEFUN_OUTPUT_DIR` (bawaan `/output`).

## Berkas

- `main.ts` — program entri
- `LICENSE` — lisensi
- `.makefun/owner.json` — dompet pemilik entri

## Lisensi

Lihat `LICENSE`.
