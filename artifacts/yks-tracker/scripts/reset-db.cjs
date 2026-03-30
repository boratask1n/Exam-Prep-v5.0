#!/usr/bin/env node
/**
 * Database Reset/Clear Script
 * Veritabanını ve uploads klasörünü temizler (TÜM VERİLER SİLİNİR!)
 * 
 * Kullanım:
 *   node scripts/reset-db.cjs [--force]
 * 
 * Örnek:
 *   node scripts/reset-db.cjs
 *   node scripts/reset-db.cjs --force  (Onay sormadan direkt sil)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// Configuration
const API_DIR = path.join(__dirname, '..', 'artifacts', 'api-server');
const UPLOADS_DIR = path.join(API_DIR, 'uploads');
const BACKUP_DIR = path.join(__dirname, '..', 'backups');

// Get database URL from environment
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/exam_prep';

// Parse database URL
function parseDatabaseUrl(url) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parsed.port || '5432',
      database: parsed.pathname.slice(1),
      user: parsed.username,
      password: parsed.password
    };
  } catch {
    return {
      host: 'localhost',
      port: '5432',
      database: 'exam_prep',
      user: 'postgres',
      password: ''
    };
  }
}

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

async function resetDatabase() {
  const force = process.argv.includes('--force');
  const db = parseDatabaseUrl(DATABASE_URL);

  console.log('');
  console.log('⚠️  ⚠️  ⚠️   U Y A R I   ⚠️  ⚠️  ⚠️');
  console.log('');
  console.log('Bu işlem şunları silecek:');
  console.log('  - TÜM sorular (questions tablosu)');
  console.log('  - TÜM çizimler (drawings tablosu)');
  console.log('  - TÜM test oturumları (test_sessions tablosu)');
  console.log('  - TÜM test soruları (test_session_questions tablosu)');
  console.log('  - uploads klasöründeki TÜM resimler');
  console.log('');
  console.log('⚠️  BU İŞLEM GERİ ALINAMAZ!');
  console.log('');

  if (!force) {
    const answer = await askQuestion(
      'Devam etmek istiyor musunuz? (evet/hayır): '
    );

    if (answer.toLowerCase() !== 'evet') {
      console.log('İşlem iptal edildi.');
      process.exit(0);
    }

    console.log('');
    const answer2 = await askQuestion(
      'Son uyarı: Yedek aldığınızdan emin misiniz? (evet/hayır): '
    );

    if (answer2.toLowerCase() !== 'evet') {
      console.log('İşlem iptal edildi.');
      console.log('');
      console.log('Yedek almak için:');
      console.log('  node scripts/backup-db.cjs');
      process.exit(0);
    }
  }

  console.log('');
  console.log('🗑️  Veritabanı temizleniyor...');
  console.log('');

  try {
    const env = { ...process.env };
    if (db.password) env.PGPASSWORD = db.password;
    
    // Drop all tables
    const dropCommands = `
DROP TABLE IF EXISTS test_session_questions CASCADE;
DROP TABLE IF EXISTS test_sessions CASCADE;
DROP TABLE IF EXISTS drawings CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
`;
    
    execSync(
      `psql -h ${db.host} -p ${db.port} -U ${db.user} -d ${db.database} -c "${dropCommands}"`,
      { 
        env,
        stdio: 'pipe'
      }
    );
    console.log('   ✅ Tüm tablolar silindi');

    // Re-run migrations
    console.log('   🔄 Migrasyonlar çalıştırılıyor...');
    
    // Note: This assumes drizzle-kit is available
    // If not, the user needs to run migrations manually
    console.log('   ℹ️  Migrasyonları manuel çalıştırın:');
    console.log('      cd lib/db && npx drizzle-kit push');
    
  } catch (error) {
    console.error('   ❌ Veritabanı temizlenirken hata:', error.message);
    console.log('   ℹ️ PostgreSQL psql komutunun yüklü olduğundan emin olun');
  }

  // Clear uploads folder
  console.log('');
  console.log('🗑️  Uploads klasörü temizleniyor...');
  
  if (fs.existsSync(UPLOADS_DIR)) {
    const files = fs.readdirSync(UPLOADS_DIR);
    let deletedCount = 0;
    
    for (const file of files) {
      const filePath = path.join(UPLOADS_DIR, file);
      if (fs.statSync(filePath).isFile()) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    }
    
    console.log(`   ✅ ${deletedCount} dosya silindi`);
  } else {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    console.log('   ✅ Uploads klasörü oluşturuldu');
  }

  console.log('');
  console.log('====================================');
  console.log('✅ VERİTABANI TEMİZLENDİ');
  console.log('====================================');
  console.log('Tüm veriler başarıyla silindi.');
  console.log('');
  console.log('Sıradaki adımlar:');
  console.log('  1. Migrasyonları çalıştırın (eğer otomatik çalışmadıysa)');
  console.log('  2. API sunucusunu yeniden başlatın');
  console.log('  3. Yeni sorular ekleyin veya import edin');
  console.log('');
  console.log('Soruları import etmek için:');
  console.log('  node scripts/import-sorular.cjs');
  console.log('====================================');
}

// Main
const command = process.argv[2];

if (command === '--help' || command === '-h') {
  console.log('Kullanım: node scripts/reset-db.cjs [options]');
  console.log('');
  console.log('Options:');
  console.log('  --force       Onay sormadan direkt sil');
  console.log('  --help, -h    Bu yardım mesajını göster');
  console.log('');
  console.log('Örnekler:');
  console.log('  node scripts/reset-db.cjs');
  console.log('  node scripts/reset-db.cjs --force');
  process.exit(0);
}

resetDatabase().catch(err => {
  console.error('Hata:', err);
  process.exit(1);
});
