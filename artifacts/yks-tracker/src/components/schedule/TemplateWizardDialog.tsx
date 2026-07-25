import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Target, Zap, Clock, CheckCircle2 } from "lucide-react";
import { StudySlot, DayName } from "./ScheduleSlotDialog";

interface TemplateWizardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplyTemplate: (slots: StudySlot[]) => void;
}

interface TemplatePreset {
  id: string;
  title: string;
  description: string;
  badge: string;
  icon: typeof Sparkles;
  slots: Omit<StudySlot, "id" | "completed">[];
}

const DAYS: DayName[] = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

const PRESETS: TemplatePreset[] = [
  {
    id: "sayisal",
    title: "🎯 YKS Sayısal Derece Kampı",
    description: "Matematik, Fizik, Kimya ve Biyoloji ağırlıklı yoğun konu anlatımı + bol soru çözümlü haftalık etüt programı.",
    badge: "Sayısal",
    icon: Target,
    slots: (function () {
      const list: Omit<StudySlot, "id" | "completed">[] = [];
      const weekdays: DayName[] = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
      weekdays.forEach((day, index) => {
        const isOdd = index % 2 === 0;
        const mat = isOdd ? "TYT Matematik" : "AYT Matematik";
        const fen1 = isOdd ? "TYT Fizik" : "AYT Fizik";
        const fen2 = isOdd ? "TYT Kimya" : "AYT Biyoloji";

        list.push(
          { day, startTime: "08:30", endTime: "09:30", lesson: "TYT Türkçe", topic: "Paragraf & Dil Bilgisi", activityType: "Soru Çözümü", targetQuestions: 30, color: "rose" },
          { day, startTime: "09:45", endTime: "11:15", lesson: mat, topic: "Konu Çalışması & Test", activityType: "Konu Çalışması", targetQuestions: 40, color: "indigo" },
          { day, startTime: "11:30", endTime: "12:30", lesson: fen1, topic: "Kavram Tekrarı & Soru", activityType: "Soru Çözümü", targetQuestions: 35, color: "amber" },
          { day, startTime: "12:30", endTime: "13:30", lesson: "Mola", activityType: "Mola", color: "slate" },
          { day, startTime: "13:30", endTime: "15:00", lesson: fen2, topic: "Soru Bankası Çözümü", activityType: "Soru Çözümü", targetQuestions: 40, color: "emerald" },
          { day, startTime: "15:15", endTime: "16:30", lesson: "AYT Matematik", topic: "Problem & İleri Düzey", activityType: "Konu Çalışması", targetQuestions: 30, color: "indigo" },
          { day, startTime: "16:45", endTime: "17:30", lesson: "Genel Tekrar", topic: "Günün Yanlış Soruları", activityType: "Tekrar", targetQuestions: 20, color: "purple" }
        );
      });
      // Pazar: Deneme & Analiz
      list.push(
        { day: "Pazar", startTime: "09:00", endTime: "11:45", lesson: "Deneme Çözümü", topic: "TYT Genel Denemesi", activityType: "Genel Deneme", targetQuestions: 125, color: "fuchsia", notes: "Optik form ile gerçek sınav simülasyonu" },
        { day: "Pazar", startTime: "12:00", endTime: "13:30", lesson: "Mola", activityType: "Mola", color: "slate" },
        { day: "Pazar", startTime: "13:30", endTime: "15:30", lesson: "Deneme Çözümü", topic: "Deneme Analizi & Eksik Notlar", activityType: "Tekrar", color: "purple" },
        { day: "Pazar", startTime: "16:00", endTime: "17:30", lesson: "Haftalık Planlama", topic: "Gelecek Haftanın Hedefleri", activityType: "Tekrar", color: "slate" }
      );
      return list;
    })(),
  },
  {
    id: "esit-agirlik",
    title: "⚖️ YKS Eşit Ağırlık Dengeli Program",
    description: "Matematik, Türkçe, Edebiyat, Tarih ve Coğrafya için günlük dengeli dağılımlı etüt şablonu.",
    badge: "Eşit Ağırlık",
    icon: Sparkles,
    slots: (function () {
      const list: Omit<StudySlot, "id" | "completed">[] = [];
      const weekdays: DayName[] = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
      weekdays.forEach((day, index) => {
        const mat = index % 2 === 0 ? "TYT Matematik" : "AYT Matematik";
        const edebiyat = index % 2 === 0 ? "AYT Edebiyat" : "TYT Türkçe";
        const sosyal = index % 2 === 0 ? "AYT Tarih" : "AYT Coğrafya";

        list.push(
          { day, startTime: "09:00", endTime: "10:15", lesson: edebiyat, topic: "Metin İnceleme & Ezber", activityType: "Konu Çalışması", color: "rose" },
          { day, startTime: "10:30", endTime: "12:00", lesson: mat, topic: "Soru Çözümü", activityType: "Soru Çözümü", targetQuestions: 40, color: "indigo" },
          { day, startTime: "12:00", endTime: "13:00", lesson: "Mola", activityType: "Mola", color: "slate" },
          { day, startTime: "13:00", endTime: "14:30", lesson: sosyal, topic: "Harita & Bilgi Kartı Tekrarı", activityType: "Konu Çalışması", color: "purple" },
          { day, startTime: "14:45", endTime: "16:00", lesson: "TYT Türkçe", topic: "Paragraf Hız Denemesi", activityType: "Branş Denemesi", targetQuestions: 30, color: "rose" }
        );
      });
      list.push(
        { day: "Pazar", startTime: "10:00", endTime: "12:45", lesson: "Deneme Çözümü", topic: "TYT / AYT Karma Deneme", activityType: "Genel Deneme", color: "fuchsia" },
        { day: "Pazar", startTime: "13:30", endTime: "15:00", lesson: "Deneme Analizi", activityType: "Tekrar", color: "purple" }
      );
      return list;
    })(),
  },
  {
    id: "pomodoro",
    title: "⏱️ Pomodoro Etüt Programı (45dk / 15dk)",
    description: "Düzenli mola aralıklarıyla odaklanmayı en üst düzeye çıkaran modüler Pomodoro etüt şablonu.",
    badge: "Pomodoro",
    icon: Clock,
    slots: (function () {
      const list: Omit<StudySlot, "id" | "completed">[] = [];
      DAYS.slice(0, 5).forEach((day) => {
        list.push(
          { day, startTime: "09:00", endTime: "09:45", lesson: "TYT Türkçe", activityType: "Soru Çözümü", targetQuestions: 25, color: "rose" },
          { day, startTime: "09:45", endTime: "10:00", lesson: "Mola", activityType: "Mola", color: "slate" },
          { day, startTime: "10:00", endTime: "10:45", lesson: "TYT Matematik", activityType: "Konu Çalışması", color: "indigo" },
          { day, startTime: "10:45", endTime: "11:00", lesson: "Mola", activityType: "Mola", color: "slate" },
          { day, startTime: "11:00", endTime: "11:45", lesson: "AYT Fen / Sosyal", activityType: "Soru Çözümü", targetQuestions: 30, color: "amber" },
          { day, startTime: "11:45", endTime: "13:00", lesson: "Uzun Mola", activityType: "Mola", color: "slate" },
          { day, startTime: "13:00", endTime: "13:45", lesson: "AYT Matematik", activityType: "Konu Çalışması", color: "indigo" },
          { day, startTime: "13:45", endTime: "14:00", lesson: "Mola", activityType: "Mola", color: "slate" },
          { day, startTime: "14:00", endTime: "14:45", lesson: "Soru Tekrarı", activityType: "Tekrar", color: "purple" }
        );
      });
      return list;
    })(),
  },
  {
    id: "seri-soru",
    title: "🔥 Son Dönem Seri Soru & Deneme Kampı",
    description: "Sadece soru çözümü, yanlış analizi ve branş denemeleri odaklı hızlandırma programı.",
    badge: "Seri Kamp",
    icon: Zap,
    slots: (function () {
      const list: Omit<StudySlot, "id" | "completed">[] = [];
      DAYS.forEach((day) => {
        list.push(
          { day, startTime: "08:30", endTime: "10:00", lesson: "Branş Denemesi", topic: "Matematik Branş Denemesi", activityType: "Branş Denemesi", targetQuestions: 40, color: "indigo" },
          { day, startTime: "10:15", endTime: "11:30", lesson: "Branş Denemesi", topic: "Fen / Sosyal Branş Denemesi", activityType: "Branş Denemesi", targetQuestions: 40, color: "emerald" },
          { day, startTime: "11:45", endTime: "12:45", lesson: "Branş Denemesi", topic: "Türkçe Branş Denemesi", activityType: "Branş Denemesi", targetQuestions: 40, color: "rose" },
          { day, startTime: "12:45", endTime: "13:45", lesson: "Mola", activityType: "Mola", color: "slate" },
          { day, startTime: "13:45", endTime: "16:00", lesson: "Yanlış Soru Analizi", topic: "Günün Yanlış & Boş Soruları", activityType: "Tekrar", color: "purple" }
        );
      });
      return list;
    })(),
  },
];

export function TemplateWizardDialog({
  open,
  onOpenChange,
  onApplyTemplate,
}: TemplateWizardDialogProps) {
  const [selectedId, setSelectedId] = useState<string>("sayisal");

  const handleApply = () => {
    const preset = PRESETS.find((p) => p.id === selectedId);
    if (!preset) return;

    const formattedSlots: StudySlot[] = preset.slots.map((s, idx) => ({
      ...s,
      id: `slot_tpl_${Date.now()}_${idx}`,
      completed: false,
    }));

    onApplyTemplate(formattedSlots);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" /> Akıllı Hazır Ders Programı Sihirbazı
          </DialogTitle>
          <DialogDescription>
            Hedefinize ve çalışma tarzınıza uygun hazır şablonu seçip haftalık programınızı anında doldurun.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-3">
          {PRESETS.map((preset) => {
            const Icon = preset.icon;
            const isSelected = selectedId === preset.id;

            return (
              <Card
                key={preset.id}
                onClick={() => setSelectedId(preset.id)}
                className={`cursor-pointer transition-all border-2 relative overflow-hidden ${
                  isSelected
                    ? "border-primary bg-primary/5 shadow-md"
                    : "border-border/60 hover:border-primary/40 hover:bg-accent/40"
                }`}
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <Badge variant="outline" className="font-semibold text-xs">
                        {preset.badge}
                      </Badge>
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="h-5 w-5 text-primary animate-in zoom-in-50" />
                    )}
                  </div>

                  <div>
                    <h3 className="font-bold text-sm text-foreground">{preset.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {preset.description}
                    </p>
                  </div>

                  <div className="text-[11px] font-medium text-primary/80">
                    {preset.slots.length} Etüt Bloğu İçeriyor
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            ⚠️ Şablon uygulandığında mevcut haftalık programınız güncellenir.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              İptal
            </Button>
            <Button onClick={handleApply}>
              Şablonu Uygula
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
