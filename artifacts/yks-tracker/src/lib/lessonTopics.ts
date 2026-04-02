/**
 * Ders ve konu listesi yönetimi
 * derslistesi.txt dosyasını parse ederek kategori bazında ders ve konuları sunar
 */

export interface LessonWithTopics {
  name: string;
  topics: string[];
}

export interface CategoryLessons {
  [category: string]: LessonWithTopics[];
}

// Raw ders listesi metni (derslistesi.txt içeriği)
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

function parseDersListesi(): CategoryLessons {
  const lines = DERS_LISTESI_RAW.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  const result: CategoryLessons = {
    'TYT': [],
    'AYT': [],
    'Geometri': []
  };
  
  let currentCategory: string | null = null;
  let currentLesson: LessonWithTopics | null = null;
  
  for (const line of lines) {
    // Kategori başlıkları
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
    
    // Ders başlıkları (TYT Xxxxx veya AYT Xxxxx formatında)
    const tytMatch = line.match(/^TYT\s+(.+)$/);
    const aytMatch = line.match(/^AYT\s+(.+)$/);
    
    if (line === 'Geometri' && currentCategory === 'Geometri') {
      // Geometri dersi
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
    
    // Konular (boş satırlarla ayrılmış)
    if (currentLesson && line.length > 0) {
      currentLesson.topics.push(line);
    }
  }
  
  // Derslistesinde olmayan dersleri ekle (konu listesi boş, elle girilecek)
  // TYT dersleri
  const tytExtraLessons = ['Din Kültürü', 'Felsefe', 'Tarih', 'Coğrafya'];
  tytExtraLessons.forEach(name => {
    if (!result['TYT'].find(l => l.name === name)) {
      result['TYT'].push({ name, topics: [] });
    }
  });
  
  // TYT Geometri dersine konuları ekle
  const tytGeometri = result['TYT'].find(l => l.name === 'Geometri');
  if (tytGeometri) {
    tytGeometri.topics = [
      'Doğruda ve Üçgende Açılar',
      'Dik Üçgen ve Trigonometrik Bağıntılar',
      'İkizkenar ve Eşkenar Üçgen',
      'Üçgende Alan ve Benzerlik',
      'Üçgende Yardımcı Elemanlar',
      'Çokgenler ve Dörtgenler',
      'Özel Dörtgenler',
      'Çember ve Daire',
      'Katı Cisimler',
      'Analitik Geometri',
      'Çemberin Analitik İncelenmesi'
    ];
  }
  
  // AYT dersleri
  const aytExtraLessons = ['Türk Dili ve Edebiyatı', 'Felsefe', 'Tarih', 'Coğrafya'];
  aytExtraLessons.forEach(name => {
    if (!result['AYT'].find(l => l.name === name)) {
      result['AYT'].push({ name, topics: [] });
    }
  });
  
  // AYT Geometri dersine konuları ekle
  const aytGeometri = result['AYT'].find(l => l.name === 'Geometri');
  if (aytGeometri) {
    aytGeometri.topics = [
      'Doğruda ve Üçgende Açılar',
      'Dik Üçgen ve Trigonometrik Bağıntılar',
      'İkizkenar ve Eşkenar Üçgen',
      'Üçgende Alan ve Benzerlik',
      'Üçgende Yardımcı Elemanlar',
      'Çokgenler ve Dörtgenler',
      'Özel Dörtgenler',
      'Çember ve Daire',
      'Katı Cisimler',
      'Analitik Geometri',
      'Çemberin Analitik İncelenmesi'
    ];
  }
  
  return result;
}

// Parse edilmiş veriyi cache'le
let cachedData: CategoryLessons | null = null;

export function getLessonsByCategory(): CategoryLessons {
  if (!cachedData) {
    cachedData = parseDersListesi();
  }
  return cachedData;
}

export function getLessonsForCategory(category: string): LessonWithTopics[] {
  const data = getLessonsByCategory();
  return data[category] || [];
}

export function getTopicsForLesson(category: string, lessonName: string): string[] {
  // Special case: Geometri lesson topics come from Geometri category
  if (lessonName === "Geometri") {
    const geometriLessons = getLessonsForCategory("Geometri");
    const geometriLesson = geometriLessons.find(l => l.name === "Geometri");
    if (geometriLesson && geometriLesson.topics.length > 0) {
      return geometriLesson.topics;
    }
    // Fallback to hardcoded topics if not found in Geometri category
    return [
      'Doğruda ve Üçgende Açılar',
      'Dik Üçgen ve Trigonometrik Bağıntılar',
      'İkizkenar ve Eşkenar Üçgen',
      'Üçgende Alan ve Benzerlik',
      'Üçgende Yardımcı Elemanlar',
      'Çokgenler ve Dörtgenler',
      'Özel Dörtgenler',
      'Çember ve Daire',
      'Katı Cisimler',
      'Analitik Geometri',
      'Çemberin Analitik İncelenmesi'
    ];
  }
  
  const lessons = getLessonsForCategory(category);
  const lesson = lessons.find(l => l.name === lessonName);
  return lesson?.topics || [];
}

export function getAllLessons(): string[] {
  const data = getLessonsByCategory();
  const lessons = new Set<string>();
  
  Object.values(data).forEach(categoryLessons => {
    categoryLessons.forEach(lesson => {
      lessons.add(lesson.name);
    });
  });
  
  return Array.from(lessons).sort();
}

export function getAllTopics(): string[] {
  const data = getLessonsByCategory();
  const topics = new Set<string>();
  
  Object.values(data).forEach(categoryLessons => {
    categoryLessons.forEach(lesson => {
      lesson.topics.forEach(topic => topics.add(topic));
    });
  });
  
  return Array.from(topics).sort();
}
