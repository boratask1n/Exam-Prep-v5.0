# Exam-Prep Geliştirici Rehberi (FOR_DEVELOPERS.md)

Bu doküman, Exam-Prep projesinin mimarisini, klasör yapısını, veritabanı ilişkilerini ve geliştirme süreçlerini kapsayan teknik rehberdir. Projeye katkı sağlayan tüm geliştiricilerin bu mimariyi takip etmesi beklenir.

---

## 1. Proje Genel Mimarisi

Exam-Prep, modern bir full-stack web uygulaması olup pnpm workspace tabanlı bir monorepo yapısında düzenlenmiştir:

```text
Exam-Prep-v5.0/
├── artifacts/                  # Ana uygulama modülleri
│   ├── yks-tracker/            # Frontend (React 18 + Vite + TailwindCSS + Radix UI)
│   └── api-server/             # Backend (Express.js + TypeScript + Node.js)
├── lib/                        # Paylaşılan kütüphaneler ve tipler
│   ├── db/                     # Drizzle ORM Şeması & PostgreSQL bağlantısı
│   ├── api-spec/               # OpenAPI 3.0 Şeması (openapi.yaml)
│   ├── api-client-react/       # Frontend için React Query / API Fetch Hook'ları
│   └── api-zod/                # API veri doğrulama Zod şemaları
├── scripts/                    # Yardımcı çalıştırma ve build betikleri
├── BASLAT.bat                  # Tek tıkla veritabanı push, build ve servisi başlatan script
├── BAGIMLILIKLARI_INDIR.bat    # Bağımlılık indirme betiği
├── DURDUR.bat                  # Çalışan Docker ve Node süreçlerini durdurma betiği
├── FOR_DEVELOPERS.md           # Bu rehber dokümanı
└── CHANGELOG.md                # Yapılan değişikliklerin kronolojik dökümü
```

---

## 2. Klasörler ve Amacı

### `artifacts/yks-tracker` (Frontend)
- **`src/pages/`**:
  - `Analysis.tsx`: Performans analizleri, başarı oranları ve çalışma istatistikleri dashboard'u.
  - `Resources.tsx`: Kaynak yönetim merkezi (Soru Bankası, Deneme, Fasikül, Ders Kitabı kartları).
  - `ResourceDetail.tsx`: **[Yeni]** Seçilen kaynağa ait özel detay görünümü, konu bazlı soru istatistikleri ve sadece o kitaba ait soruların listesi.
  - `Pool.tsx`: Soru havuzu; tüm soruların filtrelendiği ve incelendiği alan.
  - `Notes.tsx`: Not tutma ekranı (Metin notları, çizim notları).
  - `Tests.tsx` & `TestMode.tsx`: Deneme sınavı çözme modu, zamanlayıcı ve canvas çizim araçları.
  - `PracticeExams.tsx`: **[Yeni]** Denemelerim sayfası; TYT/AYT Genel Deneme ve Konu Denemesi sonuçlarının girildiği, Recharts kullanılarak Line ve Bar chart grafik analizlerinin gösterildiği sayfa.
- **`src/components/`**:
  - `QuestionFormDialog.tsx`: Soru ekleme/düzenleme penceresi. Kaynak seçildiğinde ilgili ders, kategori ve konu bilgilerini kilitler.
  - `resources/ResourceDialog.tsx`: Yeni kaynak oluşturma/düzenleme penceresi (Ders ve opsiyonel konu seçimi, otomatik isim önerisi).
  - `resources/ResourceSelect.tsx`: Soru ekleme ekranında kayıtlı kaynak seçimi bileşeni.
  - `ui/`: Radix UI temelli modüler arayüz bileşenleri (`select.tsx`, `dialog.tsx`, `button.tsx`, `badge.tsx` vb.).

### `artifacts/api-server` (Backend API)
- **`src/routes/`**:
  - `resources.ts`: GET, POST, PUT, DELETE `/api/resources` endpoint'leri. Kaynak bazlı soru ve not istatistiklerini hesaplar.
  - `questions.ts`: Soru havuzu endpoint'leri, görsel yükleme ve çözüm videoları desteği.
  - `notes.ts`: Kullanıcı notları endpoint'leri.
  - `tests.ts`: Deneme sınavları ve test oturumu yönetimi.
  - `practiceExams.ts`: **[Yeni]** Kayıtlı deneme sınavları, netleri ve istatistikleri.

### `lib/db` (Veritabanı & ORM)
- **`src/schema/resources.ts`**: Kaynaklar tablosu (`resourcesTable`). `id`, `name`, `publisher`, `category`, `lesson`, `topic`, `resourceType`, `createdAt`, `updatedAt` alanlarını barındırır.
- **`src/schema/questions.ts`**: Sorular tablosu (`questionsTable`).
- **`src/schema/notes.ts`**: Notlar tablosu (`notesTable`).

---

## 3. Veri Modeli ve Veritabanı İlişkileri

1. **Kaynağa Bağlı Sorular (`resourcesTable` 1 <---> N `questionsTable`)**:
   - `questionsTable.resourceId` alanı `resourcesTable.id` alanına foreign key ile bağlıdır.
   - Bir kaynak silindiğinde sorular korunur, `resourceId` değeri `null` olur.
2. **Kilitli Kaynak Mantığı**:
   - Kaynak oluşturulurken `category` (ör. TYT), `lesson` (ör. Türkçe) ve opsiyonel olarak `topic` (ör. Paragraf veya Dil Bilgisi) belirlenir.
   - Soru eklenirken kayıtlı bir kaynak seçilirse, sorunun dersi, kategorisi ve konusu seçilen kaynaktan otomatik alınır ve kilitlenir.

---

## 4. Geliştirici Komutları

- **Veritabanı Şemasını Uygulama**:
  ```bash
  pnpm --filter @workspace/db run push
  ```
- **Paketleri Derleme (Build)**:
  ```bash
  pnpm --filter @workspace/api-server run build
  pnpm --filter @workspace/yks-tracker run build
  ```
- **TypeScript Tip Kontrolü (Typecheck)**:
  ```bash
  pnpm --filter @workspace/yks-tracker run typecheck
  pnpm --filter @workspace/api-server run typecheck
  ```
- **Uygulamayı Çalıştırma**:
  Root dizindeki `BASLAT.bat` çalıştırıldığında PostgreSQL konteynerini açar, şemayı push eder, paketleri build alır, API ve Web sunucularını HTTPS proxy ile başlatır.
