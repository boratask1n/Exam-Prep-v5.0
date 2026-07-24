#!/usr/bin/env node
/**
 * Database Restore Script
 * PostgreSQL veritabanını ve uploads klasörünü yedekten geri yükler
 * 
 * Kullanım:
 *   node scripts/restore-db.cjs [backup-name]
 * 
 * Örnek:
 *   node scripts/restore-db.cjs backup-2024-01-15
 *   node scripts/restore-db.cjs --list
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

async function restoreBackup(backupName) {
  const backupPath = path.join(BACKUP_DIR, backupName);

  // Validate backup exists
  if (!fs.existsSync(backupPath)) {
    console.error(`❌ Yedek bulunamadı: ${backupName}`);
    console.log('');
    console.log('Mevcut yedekleri görmek için:');
    console.log('  node scripts/restore-db.cjs --list');
    process.exit(1);
  }

  // Check metadata
  const metadataPath = path.join(backupPath, 'metadata.json');
  let metadata = {};
  if (fs.existsSync(metadataPath)) {
    try {
      metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      console.log('📋 Yedek bilgileri:');
      console.log(`   Ad: ${metadata.name || backupName}`);
      console.log(`   Tarih: ${metadata.createdAt ? new Date(metadata.createdAt).toLocaleString('tr-TR') : 'Bilinmiyor'}`);
      if (metadata.uploadsCount !== undefined) {
        console.log(`   Resim sayısı: ${metadata.uploadsCount}`);
      }
      console.log('');
    } catch {}
  }

  // Confirm restore
  const answer = await askQuestion(
    '⚠️  Mevcut veritabanı ve uploads klasörü silinecek. Devam etmek istiyor musunuz? (evet/hayır): '
  );

  if (answer.toLowerCase() !== 'evet') {
    console.log('İşlem iptal edildi.');
    process.exit(0);
  }

  console.log('');
  console.log('🔄 Geri yükleme başlatılıyor...');
  console.log('');

  const db = parseDatabaseUrl(DATABASE_URL);

  // Clear uploads folder
  console.log('🗑️  Uploads klasörü temizleniyor...');
  if (fs.existsSync(UPLOADS_DIR)) {
    const files = fs.readdirSync(UPLOADS_DIR);
    for (const file of files) {
      const filePath = path.join(UPLOADS_DIR, file);
      if (fs.statSync(filePath).isFile()) {
        fs.unlinkSync(filePath);
      }
    }
    console.log(`   ✅ ${files.length} dosya silindi`);
  } else {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    console.log('   ✅ Uploads klasörü oluşturuldu');
  }

  // Restore database
  console.log('💾 Veritabanı geri yükleniyor...');
  const dumpFile = path.join(backupPath, 'database.sql');
  
  if (!fs.existsSync(dumpFile)) {
    console.error('   ❌ Veritabanı yedek dosyası bulunamadı:', dumpFile);
    process.exit(1);
  }

  try {
    const env = { ...process.env };
    if (db.password) env.PGPASSWORD = db.password;
    
    execSync(
      `psql -h ${db.host} -p ${db.port} -U ${db.user} -d ${db.database} -f "${dumpFile}"`,
      { 
        env,
        stdio: 'pipe'
      }
    );
    console.log('   ✅ Veritabanı geri yüklendi');
  } catch (error) {
    console.error('   ❌ Veritabanı geri yüklenirken hata:', error.message);
    console.log('   ℹ️ PostgreSQL psql komutunun yüklü olduğundan emin olun');
    process.exit(1);
  }

  // Restore uploads
  console.log('📁 Uploads klasörü geri yükleniyor...');
  const uploadsBackupPath = path.join(backupPath, 'uploads');
  
  if (fs.existsSync(uploadsBackupPath)) {
    const files = fs.readdirSync(uploadsBackupPath);
    let copiedCount = 0;
    
    for (const file of files) {
      const srcPath = path.join(uploadsBackupPath, file);
      const destPath = path.join(UPLOADS_DIR, file);
      
      if (fs.statSync(srcPath).isFile()) {
        fs.copyFileSync(srcPath, destPath);
        copiedCount++;
      }
    }
    
    console.log(`   ✅ ${copiedCount} dosya geri yüklendi`);
  } else {
    console.log('   ℹ️ Uploads yedeği bulunamadı, atlanıyor');
  }

  console.log('');
  console.log('====================================');
  console.log('✅ GERİ YÜKLEME TAMAMLANDI');
  console.log('====================================');
  console.log('Veritabanı ve uploads başarıyla geri yüklendi.');
  console.log('');
  console.log('UYARI: API sunucusunu yeniden başlatmanız gerekebilir.');
  console.log('====================================');
}

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) {
    console.log('Henüz yedek bulunmuyor.');
    return;
  }
  
  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(name => fs.statSync(path.join(BACKUP_DIR, name)).isDirectory())
    .sort((a, b) => {
      const aStat = fs.statSync(path.join(BACKUP_DIR, a));
      const bStat = fs.statSync(path.join(BACKUP_DIR, b));
      return bStat.mtime - aStat.mtime;
    });
  
  if (backups.length === 0) {
    console.log('Henüz yedek bulunmuyor.');
    return;
  }
  
  console.log('Mevcut yedekler:');
  console.log('');
  
  backups.forEach((name, index) => {
    const backupPath = path.join(BACKUP_DIR, name);
    const stat = fs.statSync(backupPath);
    const metadataPath = path.join(backupPath, 'metadata.json');
    
    let meta = {};
    if (fs.existsSync(metadataPath)) {
      try {
        meta = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      } catch {}
    }
    
    console.log(`${index + 1}. ${name}`);
    console.log(`   Tarih: ${stat.mtime.toLocaleString('tr-TR')}`);
    if (meta.uploadsCount !== undefined) {
      console.log(`   Resim sayısı: ${meta.uploadsCount}`);
    }
    console.log('');
  });
  
  console.log('Geri yüklemek için:');
  console.log('  node scripts/restore-db.cjs <yedek-adı>');
}

// Main
const command = process.argv[2];

if (!command || command === '--help' || command === '-h') {
  console.log('Kullanım: node scripts/restore-db.cjs <backup-name>');
  console.log('');
  console.log('Options:');
  console.log('  --list, -l    Mevcut yedekleri listele');
  console.log('  --help, -h    Bu yardım mesajını göster');
  console.log('');
  console.log('Örnekler:');
  console.log('  node scripts/restore-db.cjs backup-2024-01-15T10-30-00');
  console.log('  node scripts/restore-db.cjs onemli-yedek');
  console.log('  node scripts/restore-db.cjs --list');
  process.exit(0);
}

if (command === '--list' || command === '-l') {
  listBackups();
} else {
  restoreBackup(command).catch(err => {
    console.error('Hata:', err);
    process.exit(1);
  });
}
