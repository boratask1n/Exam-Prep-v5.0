/**
 * Test Verisi Generator
 * Her ders ve konu için örnek sorular oluşturur
 * 
 * Kullanım:
 *   npx tsx scripts/seed-data.ts [--limit-per-topic=2]
 */

import { getLessonsByCategory, type CategoryLessons } from "../src/lib/lessonTopics.js";

const API_BASE = process.env.API_URL || "http://localhost:3000";

// Rastgele seçenekler
const publishers = ["3D Yayınları", "Bilgi Sarmal", "Karekök", "Palme", "Antrenman", "ÖSYM Tadında", "Test Okulu", "Hız ve Renk"];
const testPrefixes = ["Test", "Deneme", "Sınav", "Çalışma", "Analiz", "Pratik", "Uygulama"];
const testSuffixes = ["1", "2", "3", "A", "B", "C", "24", "25", "ÖSYM Stili", "Kolay", "Orta", "Zor"];

// Rastgele eleman seç
function random<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Rastgele sayı (min-max arası)
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Rastgele test adı oluştur
function generateTestName(): string {
  return `${random(testPrefixes)} ${random(testSuffixes)}`;
}

// API'ye POST isteği
async function apiPost(endpoint: string, data: unknown): Promise<unknown> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  
  return res.json();
}

// Bir soru oluştur
async function createSampleQuestion(
  category: string,
  lesson: string,
  topic: string,
  index: number
): Promise<boolean> {
  const publisher = random(publishers);
  const testName = generateTestName();
  const testNo = String(randomInt(1, 20));
  
  const payload = {
    category,
    source: "Banka",
    lesson,
    topic,
    publisher,
    testName,
    testNo,
    imageUrl: null, // Resim yok
    status: "Cozulmedi",
    description: `${topic} konusundan örnek soru #${index + 1}`,
  };
  
  try {
    const result = await apiPost("/api/questions", payload) as { id: number };
    console.log(`  ✅ [${category}/${lesson}/${topic}] ID=${result.id}`);
    return true;
  } catch (err) {
    console.error(`  ❌ [${category}/${lesson}/${topic}] ${(err as Error).message}`);
    return false;
  }
}

// Ana işlem
async function main() {
  const limitPerTopic = parseInt(process.argv.find(a => a.startsWith("--limit-per-topic="))?.split("=")[1] || "2");
  
  console.log("\n🚀 Test Verisi Generator Başlatıldı");
  console.log(`🌐 API: ${API_BASE}`);
  console.log(`📊 Her konu için: ${limitPerTopic} soru`);
  console.log("");
  
  // Ders listesini al
  const data: CategoryLessons = getLessonsByCategory();
  
  let totalCreated = 0;
  let totalFailed = 0;
  let topicCount = 0;
  
  for (const [category, lessons] of Object.entries(data)) {
    console.log(`\n📚 ${category}`);
    
    for (const lessonData of lessons) {
      const lesson = lessonData.name;
      const topics = lessonData.topics;
      
      if (topics.length === 0) {
        // Konu listesi olmayan dersler için boş konu ile bir kayıt
        console.log(`  📝 ${lesson} (konu listesi yok)`);
        for (let i = 0; i < limitPerTopic; i++) {
          const ok = await createSampleQuestion(category, lesson, "", i);
          if (ok) totalCreated++; else totalFailed++;
          await new Promise(r => setTimeout(r, 50)); // Rate limit
        }
        topicCount++;
      } else {
        // Her konu için
        for (const topic of topics) {
          console.log(`  📝 ${lesson} > ${topic}`);
          for (let i = 0; i < limitPerTopic; i++) {
            const ok = await createSampleQuestion(category, lesson, topic, i);
            if (ok) totalCreated++; else totalFailed++;
            await new Promise(r => setTimeout(r, 50)); // Rate limit
          }
          topicCount++;
        }
      }
    }
  }
  
  // Özet
  console.log("\n" + "=".repeat(50));
  console.log("📊 SEED RAPORU");
  console.log("=".repeat(50));
  console.log(`İşlenen Konu/Ders: ${topicCount}`);
  console.log(`Oluşturulan Soru: ${totalCreated} ✅`);
  console.log(`Başarısız: ${totalFailed} ❌`);
  console.log("=".repeat(50) + "\n");
}

main().catch((err) => {
  console.error("💥 Kritik hata:", err);
  process.exit(1);
});
