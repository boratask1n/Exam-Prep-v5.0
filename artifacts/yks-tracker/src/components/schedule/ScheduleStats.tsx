import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Clock, Target, CalendarDays, BookOpen } from "lucide-react";
import { StudySlot } from "./ScheduleSlotDialog";

interface ScheduleStatsProps {
  slots: StudySlot[];
  activeDay?: string;
}

export function ScheduleStats({ slots, activeDay }: ScheduleStatsProps) {
  const stats = useMemo(() => {
    const totalSlots = slots.length;
    const completedSlots = slots.filter((s) => s.completed).length;
    const completionPercent = totalSlots > 0 ? Math.round((completedSlots / totalSlots) * 100) : 0;

    // Total target questions
    const totalQuestions = slots.reduce((acc, s) => acc + (s.targetQuestions || 0), 0);
    const completedQuestions = slots
      .filter((s) => s.completed)
      .reduce((acc, s) => acc + (s.targetQuestions || 0), 0);

    // Total study duration in hours/minutes
    let totalMinutes = 0;
    let completedMinutes = 0;

    slots.forEach((s) => {
      if (s.startTime && s.endTime) {
        const [sh, sm] = s.startTime.split(":").map(Number);
        const [eh, em] = s.endTime.split(":").map(Number);
        const diff = (eh * 60 + em) - (sh * 60 + sm);
        if (diff > 0) {
          totalMinutes += diff;
          if (s.completed) completedMinutes += diff;
        }
      }
    });

    const totalHours = (totalMinutes / 60).toFixed(1);
    const completedHours = (completedMinutes / 60).toFixed(1);

    // Active day stats
    const daySlots = activeDay ? slots.filter((s) => s.day === activeDay) : [];
    const dayCompleted = daySlots.filter((s) => s.completed).length;
    const dayPercent = daySlots.length > 0 ? Math.round((dayCompleted / daySlots.length) * 100) : 0;

    return {
      totalSlots,
      completedSlots,
      completionPercent,
      totalQuestions,
      completedQuestions,
      totalHours,
      completedHours,
      daySlotsCount: daySlots.length,
      dayCompletedCount: dayCompleted,
      dayPercent,
    };
  }, [slots, activeDay]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <Card className="border-border/60 shadow-sm bg-card/60 backdrop-blur-sm">
        <CardContent className="p-4 flex items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Haftalık İlerleme
            </p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl font-bold tracking-tight text-foreground">
                %{stats.completionPercent}
              </span>
              <span className="text-xs text-muted-foreground">
                ({stats.completedSlots}/{stats.totalSlots} Etüt)
              </span>
            </div>
            <Progress value={stats.completionPercent} className="h-1.5 mt-2" />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm bg-card/60 backdrop-blur-sm">
        <CardContent className="p-4 flex items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Clock className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Toplam Planlanan Süre
            </p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl font-bold tracking-tight text-foreground">
                {stats.totalHours} Sa
              </span>
              <span className="text-xs text-muted-foreground">
                ({stats.completedHours} Sa Tamamlandı)
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-1 truncate">
              {stats.totalSlots} modüler çalışma etüdü
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm bg-card/60 backdrop-blur-sm">
        <CardContent className="p-4 flex items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Target className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Haftalık Soru Hedefi
            </p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl font-bold tracking-tight text-foreground">
                {stats.totalQuestions} Soru
              </span>
            </div>
            <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1 truncate">
              ✓ {stats.completedQuestions} Soru Tamamlandı
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm bg-card/60 backdrop-blur-sm">
        <CardContent className="p-4 flex items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <CalendarDays className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {activeDay ? `${activeDay} Durumu` : "Günlük Durum"}
            </p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl font-bold tracking-tight text-foreground">
                %{stats.dayPercent}
              </span>
              <span className="text-xs text-muted-foreground">
                ({stats.dayCompletedCount}/{stats.daySlotsCount} Etüt)
              </span>
            </div>
            <Progress value={stats.dayPercent} className="h-1.5 mt-2" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
