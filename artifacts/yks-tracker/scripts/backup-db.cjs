#!/usr/bin/env node
/**
 * Database Backup Script
 * PostgreSQL veritabanını ve uploads klasörünü yedekler
 * 
 * Kullanım:
 *   node scripts/backup-db.cjs [backup-name]
 * 
 * Örnek:
 *   node scripts/backup-db.cjs
 *   node scripts/backup-db.cjs onemli-yedek
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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

function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupName = process.argv[2] || `backup-${timestamp}`;
  const backupPath = path.join(BACKUP_DIR, backupName);

  console.log(`📦 Yedekleme başlatılıyor: ${backupName}`);
  console.log('');

  // Create backup directory
  if (!fs.existsSync(backupPath)) {
    fs.mkdirSync(backupPath, { recursive: true });
  }

  const db = parseDatabaseUrl(DATABASE_URL);

  // Backup database using pg_dump
  console.log('💾 Veritabanı yedekleniyor...');
  const dumpFile = path.join(backupPath, 'database.sql');
  
  try {
    const env = { ...process.env };
    if (db.password) env.PGPASSWORD = db.password;
    
    execSync(
      `pg_dump -h ${db.host} -p ${db.port} -U ${db.user} -d ${db.database} -f "${dumpFile}" --clean --if-exists`,
      { 
        env,
        stdio: 'pipe'
      }
    );
    console.log(`   ✅ Veritabanı yedeklendi: ${dumpFile}`);
  } catch (error) {
    console.error('   ❌ Veritabanı yedeklenirken hata:', error.message);
    console.log('   ℹ️ PostgreSQL pg_dump komutunun yüklü olduğundan emin olun');
    process.exit(1);
  }

  // Backup uploads folder
  console.log('📁 Uploads klasörü yedekleniyor...');
  const uploadsBackupPath = path.join(backupPath, 'uploads');
  
  if (fs.existsSync(UPLOADS_DIR)) {
    if (!fs.existsSync(uploadsBackupPath)) {
      fs.mkdirSync(uploadsBackupPath, { recursive: true });
    }
    
    const files = fs.readdirSync(UPLOADS_DIR);
    let copiedCount = 0;
    
    for (const file of files) {
      const srcPath = path.join(UPLOADS_DIR, file);
      const destPath = path.join(uploadsBackupPath, file);
      
      if (fs.statSync(srcPath).isFile()) {
        fs.copyFileSync(srcPath, destPath);
        copiedCount++;
      }
    }
    
    console.log(`   ✅ ${copiedCount} dosya yedeklendi`);
  } else {
    console.log('   ℹ️ Uploads klasörü bulunamadı, atlanıyor');
  }

  // Create metadata file
  const metadata = {
    name: backupName,
    createdAt: new Date().toISOString(),
    databaseUrl: DATABASE_URL.replace(/:([^:@]+)@/, ':***@'), // Hide password
    tables: ['questions', 'drawings', 'test_sessions', 'test_session_questions'],
    uploadsCount: fs.existsSync(uploadsBackupPath) ? fs.readdirSync(uploadsBackupPath).length : 0
  };
  
  fs.writeFileSync(
    path.join(backupPath, 'metadata.json'),
    JSON.stringify(metadata, null, 2)
  );

  console.log('');
  console.log('====================================');
  console.log('📊 YEDEKLEME TAMAMLANDI');
  console.log('====================================');
  console.log(`Yedek adı: ${backupName}`);
  console.log(`Konum: ${backupPath}`);
  console.log(`Veritabanı: ${dumpFile}`);
  console.log('');
  console.log('Geri yüklemek için:');
  console.log(`  node scripts/restore-db.cjs ${backupName}`);
  console.log('====================================');
}

// List existing backups
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
}

// Main
const command = process.argv[2];

if (command === '--list' || command === '-l') {
  listBackups();
} else if (command === '--help' || command === '-h') {
  console.log('Kullanım: node scripts/backup-db.cjs [backup-name|options]');
  console.log('');
  console.log('Options:');
  console.log('  --list, -l    Mevcut yedekleri listele');
  console.log('  --help, -h    Bu yardım mesajını göster');
  console.log('');
  console.log('Örnekler:');
  console.log('  node scripts/backup-db.cjs');
  console.log('  node scripts/backup-db.cjs onemli-yedek');
  console.log('  node scripts/backup-db.cjs --list');
} else {
  createBackup();
}
