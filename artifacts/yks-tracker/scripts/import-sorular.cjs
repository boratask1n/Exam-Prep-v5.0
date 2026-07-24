/**
 * Soru Arşivi Import Script'i
 * Soru Arşivi klasöründeki resimleri tarar ve API'ye yükler
 * 
 * Kullanım:
 *   node scripts/import-sorular.cjs [--dry-run] [--limit=10]
 */

const fs = require('fs');
const path = require('path');

const API_BASE = process.env.API_URL || "http://localhost:8080";
const ARCHIVE_DIR = 'C:\\Users\\TKA\\Desktop\\Exam-Prep\\Exam-Prep\\Soru Arşivi';

// Desteklenen resim formatları
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];

// İstatistikler
let stats = {
  scanned: 0,
  uploaded: 0,
  created: 0,
  errors: 0,
  skipped: 0
};

// Komut satırı argümanları
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT_ARG = args.find(a => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1]) : Infinity;

/**
 * Klasörü recursive olarak tara
 */
function scanDirectory(dir, basePath = '') {
  const results = [];
  
  if (!fs.existsSync(dir)) {
    console.error(`❌ Klasör bulunamadı: ${dir}`);
    return results;
  }
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.join(basePath, entry.name);
    
    if (entry.isDirectory()) {
      results.push(...scanDirectory(fullPath, relPath));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (IMAGE_EXTENSIONS.includes(ext)) {
        // Çözüm resimlerini atla (çözüm, solution, cevap anahtarı vs. içerenler)
        const lowerName = entry.name.toLowerCase();
        if (!lowerName.includes('çözüm') && 
            !lowerName.includes('cozum') && 
            !lowerName.includes('solution') &&
            !lowerName.includes('cevap') &&
            !lowerName.includes('answer') &&
            !lowerName.includes('aciklama')) {
          results.push({
            fullPath,
            relPath,
            filename: entry.name
          });
        }
      }
    }
  }
  
  return results;
}

/**
 * Dosya yolundan soru bilgilerini çıkar
 * Yapı: KATEGORI/DERS/KONU/TEST_ADI/sorX.png
 */
function parseQuestionInfo(relPath) {
  // Örnek: AYT/Biyoloji/Destek ve Hareket Sistemi/Analiz - 24/sor1.png
  const parts = relPath.split(path.sep);
  
  if (parts.length < 4) {
    console.warn(`  ⚠️ Geçersiz yol (en az 4 seviye olmalı): ${relPath}`);
    return null;
  }
  
  const category = parts[0];
  const lesson = parts[1];
  const topic = parts[2] || null; // 3. seviye KONU
  
  // Test adı (sonraki seviyelerden)
  const testName = parts.length > 3 ? parts[parts.length - 2] : null;
  
  // Soru no (filename'dan)
  const filename = parts[parts.length - 1];
  const match = filename.match(/sor[üu]?(\d+)/i);
  const testNo = match ? match[1] : null;
  
  return {
    category,
    lesson,
    publisher: null, // Klasör yapısında yayınevi yok
    topic,
    testName: testName && !testName.match(/^sor\d+/i) ? testName : null,
    testNo,
  };
}

/**
 * Resmi base64'e çevir
 */
function imageToBase64(filePath) {
  const buffer = fs.readFileSync(filePath);
  return buffer.toString('base64');
}

/**
 * API'ye resim yükle
 */
async function uploadImage(filePath) {
  const base64Data = imageToBase64(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : 
                   ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
                   ext === '.gif' ? 'image/gif' :
                   ext === '.webp' ? 'image/webp' : 'image/png';
  
  const res = await fetch(`${API_BASE}/api/questions/image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageData: base64Data,
      mimeType: mimeType
    })
  });
  
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  
  const data = await res.json();
  return data.imageUrl || data.url;
}

/**
 * Soru oluştur
 */
async function createQuestion(questionInfo, imageUrl) {
  const payload = {
    category: questionInfo.category,
    source: "Banka",
    lesson: questionInfo.lesson,
    topic: questionInfo.topic || "",
    publisher: questionInfo.publisher,
    testName: questionInfo.testName,
    testNo: questionInfo.testNo,
    imageUrl: imageUrl,
    status: "Cozulmedi",
    description: `${questionInfo.lesson} - ${questionInfo.topic || 'Genel'}`,
  };
  
  const res = await fetch(`${API_BASE}/api/questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  
  return res.json();
}

/**
 * Ana işlem
 */
async function main() {
  console.log('\n🚀 Soru Arşivi Import Başlatıldı');
  console.log(`📁 Klasör: ${ARCHIVE_DIR}`);
  console.log(`🌐 API: ${API_BASE}`);
  if (DRY_RUN) console.log('⚠️  DRY-RUN MODU: Sadece rapor, kayıt yapılmayacak');
  if (LIMIT !== Infinity) console.log(`📊 Limit: ${LIMIT} soru`);
  console.log('');
  
  // Dosyaları tara
  console.log('🔍 Dosyalar taranıyor...');
  const files = scanDirectory(ARCHIVE_DIR);
  console.log(`   ${files.length} resim bulundu\n`);
  
  if (files.length === 0) {
    console.log('❌ Import edilecek dosya bulunamadı');
    return;
  }
  
  // İşleme
  let processed = 0;
  
  for (const file of files) {
    if (processed >= LIMIT) {
      console.log(`\n📊 Limit (${LIMIT}) aşıldı, durduruluyor...`);
      break;
    }
    
    stats.scanned++;
    processed++;
    
    console.log(`[${processed}/${Math.min(files.length, LIMIT)}] ${file.relPath}`);
    
    // Bilgileri çıkar
    const info = parseQuestionInfo(file.relPath);
    if (!info) {
      stats.skipped++;
      continue;
    }
    
    console.log(`   Kategori: ${info.category} | Ders: ${info.lesson} | Konu: ${info.topic || '-'} | Test: ${info.testName || '-'} | No: ${info.testNo || '-'}`);
    
    if (DRY_RUN) {
      console.log('   ⏭️  Dry-run: Atlanıyor\n');
      continue;
    }
    
    try {
      // Resmi yükle
      console.log('   📤 Resim yükleniyor...');
      const imageUrl = await uploadImage(file.fullPath);
      console.log(`   ✅ Resim yüklendi: ${imageUrl}`);
      stats.uploaded++;
      
      // Soru oluştur
      console.log('   📝 Soru oluşturuluyor...');
      const question = await createQuestion(info, imageUrl);
      console.log(`   ✅ Soru oluşturuldu: ID=${question.id}\n`);
      stats.created++;
      
    } catch (err) {
      console.error(`   ❌ HATA: ${err.message}\n`);
      stats.errors++;
    }
    
    // Rate limiting
    await new Promise(r => setTimeout(r, 100));
  }
  
  // Özet
  console.log('\n' + '='.repeat(60));
  console.log('📊 IMPORT RAPORU');
  console.log('='.repeat(60));
  console.log(`Taranan: ${stats.scanned}`);
  console.log(`Yüklenen Resim: ${stats.uploaded} ✅`);
  console.log(`Oluşturulan Soru: ${stats.created} ✅`);
  console.log(`Atlanan: ${stats.skipped} ⏭️`);
  console.log(`Hata: ${stats.errors} ❌`);
  console.log('='.repeat(60) + '\n');
}

main().catch(err => {
  console.error('💥 Kritik hata:', err);
  process.exit(1);
});
