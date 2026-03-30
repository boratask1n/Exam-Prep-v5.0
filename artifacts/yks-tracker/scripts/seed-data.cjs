/**
 * Test Verisi Generator (CommonJS)
 * Her ders ve konu için örnek sorular oluşturur
 * 
 * Kullanım:
 *   node scripts/seed-data.cjs [--limit-per-topic=2]
 */

const API_BASE = process.env.API_URL || "http://localhost:8080";

// Ders listesi verisi (lessonTopics.ts'den alındı)
const DERS_LISTESI_RAW = `TYT Türkçe

Sözcükte Anlam

Cümlede Anlam

Paragraf

Ses Bilgisi

Yazım Kuralları

Noktalama İşaretleri

Sözcük Türleri

Tamlamalar

Fiiller, Ek Fiil ve Fiilimsi

Cümlenin Ögeleri

Cümle Türleri

Anlatım Bozuklukları

TYT Matematik

Temel Kavramlar

Sayı Basamakları

Bölme ve Bölünebilme Kuralları

EBOB-EKOK

Rasyonel Sayılar

Basit Eşitsizlikler

Mutlak Değer

Üslü İfadeler

Köklü İfadeler

Çarpanlara Ayırma

Oran-Orantı

Denklemler

Problemler

Kümeler ve Kartezyen Çarpım

Mantık

Fonksiyonlar

Veri ve İstatistik

Sayma ve Olasılık

TYT Fizik

Fizik Bilimine Giriş

Madde ve Özellikleri

Hareket ve Kuvvet

Enerji

Isı, Sıcaklık ve Genleşme

Elektrostatik

Elektrik Akımı ve Devreler

Manyetizma

Basınç ve Kaldırma Kuvveti

Dalgalar

Optik

TYT Kimya

Kimya Bilimi

Atom ve Periyodik Sistem

Kimyasal Türler Arası Etkileşimler

Maddenin Halleri

Doğa ve Kimya

Kimyanın Temel Kanunları

Kimyasal Hesaplamalar

Karışımlar

Asitler, Bazlar ve Tuzlar

Kimya Her Yerde

TYT Biyoloji

Canlıların Ortak Özellikleri

Canlıların Temel Bileşenleri

Hücre ve Organeller

Canlıların Sınıflandırılması

Hücre Bölünmeleri

Kalıtım ve Genetik

Ekosistem ve Güncel Çevre Sorunları

AYT DERSLERİ
AYT Matematik

Polinomlar

İkinci Dereceden Denklemler ve Karmaşık Sayılar

Eşitsizlikler

Parabol

Fonksiyonlarda Uygulamalar

Trigonometri

Logaritma

Diziler

Limit ve Süreklilik

Türev

İntegral

AYT Fizik

Vektörler

Bağıl Hareket

Newton'ın Hareket Yasaları

Sabit İvmeli Hareket

Enerji ve Hareket

İtme ve Çizgisel Momentum

Tork, Denge ve Kütle Merkezi

Basit Makineler

Elektriksel Kuvvet ve Potansiyel

Düzgün Elektriksel Alan ve Sığaçlar

Manyetizma ve Elektromanyetik İndüklenme

Alternatif Akım ve Transformatörler

Çembersel Hareket ve Kütleçekimi

Basit Harmonik Hareket

Dalga Mekaniği

Atom Fiziğine Giriş ve Radyoaktivite

Modern Fizik

Modern Fiziğin Teknolojideki Uygulamaları

AYT Kimya

Modern Atom Teorisi

Gazlar

Sıvı Çözeltiler ve Çözünürlük

Kimyasal Tepkimelerde Enerji

Kimyasal Tepkimelerde Hız

Kimyasal Tepkimelerde Denge

Asit-Baz Dengesi

Çözünürlük Dengesi

Kimya ve Elektrik

Karbon Kimyasına Giriş

Organik Bileşikler

Enerji Kaynakları ve Bilimsel Gelişmeler

AYT Biyoloji

Sinir Sistemi

Endokrin Sistem

Duyu Organları

Destek ve Hareket Sistemi

Sindirim Sistemi

Dolaşım ve Bağışıklık Sistemi

Solunum Sistemi

Boşaltım Sistemi

Üreme Sistemi ve Embriyonik Gelişim

Komünite ve Popülasyon Ekolojisi

Genden Proteine

Canlılarda Enerji Dönüşümleri

Bitki Biyolojisi

Canlılar ve Çevre

GEOMETRİ (TYT & AYT)
Geometri

Doğruda ve Üçgende Açılar

Dik Üçgen ve Trigonometrik Bağıntılar

İkizkenar ve Eşkenar Üçgen

Üçgende Alan ve Benzerlik

Üçgende Yardımcı Elemanlar

Çokgenler ve Dörtgenler

Özel Dörtgenler

Çember ve Daire

Katı Cisimler

Analitik Geometri

Çemberin Analitik İncelenmesi`;

function parseDersListesi() {
  const lines = DERS_LISTESI_RAW.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  const result = {
    'TYT': [],
    'AYT': [],
    'Geometri': []
  };
  
  let currentCategory = null;
  let currentLesson = null;
  
  for (const line of lines) {
    if (line === 'AYT DERSLERİ') {
      currentCategory = 'AYT';
      currentLesson = null;
      continue;
    }
    
    if (line === 'GEOMETRİ (TYT & AYT)') {
      currentCategory = 'Geometri';
      currentLesson = null;
      continue;
    }
    
    const tytMatch = line.match(/^TYT\s+(.+)$/);
    const aytMatch = line.match(/^AYT\s+(.+)$/);
    
    if (line === 'Geometri' && currentCategory === 'Geometri') {
      currentLesson = { name: 'Geometri', topics: [] };
      result['Geometri'].push(currentLesson);
      continue;
    }
    
    if (tytMatch) {
      currentCategory = 'TYT';
      const lessonName = tytMatch[1];
      currentLesson = { name: lessonName, topics: [] };
      result['TYT'].push(currentLesson);
      continue;
    }
    
    if (aytMatch) {
      currentCategory = 'AYT';
      const lessonName = aytMatch[1];
      currentLesson = { name: lessonName, topics: [] };
      result['AYT'].push(currentLesson);
      continue;
    }
    
    if (currentLesson && line.length > 0) {
      currentLesson.topics.push(line);
    }
  }
  
  // Ek dersler
  const tytExtra = ['Din Kültürü', 'Felsefe', 'Tarih', 'Coğrafya'];
  tytExtra.forEach(name => {
    if (!result['TYT'].find(l => l.name === name)) {
      result['TYT'].push({ name, topics: [] });
    }
  });
  
  const aytExtra = ['Türk Dili ve Edebiyatı', 'Felsefe', 'Tarih', 'Coğrafya'];
  aytExtra.forEach(name => {
    if (!result['AYT'].find(l => l.name === name)) {
      result['AYT'].push({ name, topics: [] });
    }
  });
  
  return result;
}

const publishers = ["3D Yayınları", "Bilgi Sarmal", "Karekök", "Palme", "Antrenman", "ÖSYM Tadında", "Test Okulu", "Hız ve Renk", "Biyopsi", "Yayın Denizi"];
const testPrefixes = ["Test", "Deneme", "Sınav", "Çalışma", "Analiz", "Pratik", "Uygulama", "Kamp", "Tarama"];
const testSuffixes = ["1", "2", "3", "4", "5", "A", "B", "C", "24", "25", "ÖSYM Stili", "Kolay", "Orta", "Zor", "Klasik"];

// Rastgele eleman seç
function random(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Rastgele sayı (min-max arası)
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Rastgele test adı oluştur
function generateTestName() {
  return `${random(testPrefixes)} ${random(testSuffixes)}`;
}

// API'ye POST isteği
async function apiPost(endpoint, data) {
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
async function createSampleQuestion(category, lesson, topic, index) {
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
    description: `${topic || lesson} konusundan örnek soru #${index + 1}`,
  };
  
  try {
    const result = await apiPost("/api/questions", payload);
    console.log(`  ✅ [${category}/${lesson}/${topic || 'Genel'}] ID=${result.id}`);
    return true;
  } catch (err) {
    console.error(`  ❌ [${category}/${lesson}/${topic || 'Genel'}] ${err.message}`);
    console.error(`     Details:`, err);
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
  const data = parseDersListesi();
  
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
