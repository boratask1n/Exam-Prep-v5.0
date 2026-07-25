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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { DayName, DAYS_OF_WEEK, StudySlot } from "./ScheduleSlotDialog";
import { Copy } from "lucide-react";

interface CopyDayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceDay: DayName;
  slots: StudySlot[];
  onCopy: (targetDays: DayName[]) => void;
}

export function CopyDayDialog({
  open,
  onOpenChange,
  sourceDay,
  slots,
  onCopy,
}: CopyDayDialogProps) {
  const sourceSlotsCount = slots.filter((s) => s.day === sourceDay).length;
  const targetDayOptions = DAYS_OF_WEEK.filter((d) => d !== sourceDay);

  const [selectedTargets, setSelectedTargets] = useState<DayName[]>([]);

  const toggleDay = (day: DayName) => {
    if (selectedTargets.includes(day)) {
      setSelectedTargets(selectedTargets.filter((d) => d !== day));
    } else {
      setSelectedTargets([...selectedTargets, day]);
    }
  };

  const selectAll = () => {
    setSelectedTargets(targetDayOptions);
  };

  const clearAll = () => {
    setSelectedTargets([]);
  };

  const handleConfirm = () => {
    if (selectedTargets.length === 0) return;
    onCopy(selectedTargets);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Copy className="h-5 w-5 text-primary" /> {sourceDay} Programını Kopyala
          </DialogTitle>
          <DialogDescription>
            {sourceDay} gününe ait <strong>{sourceSlotsCount} etüt bloğunu</strong> seçtiğiniz günlere çoğaltın.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Hedef Günler Seçimi
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAll}>
                Tümünü Seç
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={clearAll}>
                Temizle
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {targetDayOptions.map((day) => {
              const isChecked = selectedTargets.includes(day);

              return (
                <div
                  key={day}
                  onClick={() => toggleDay(day)}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    isChecked
                      ? "border-primary bg-primary/10 font-semibold"
                      : "border-border/60 hover:bg-accent/40"
                  }`}
                >
                  <Checkbox checked={isChecked} onCheckedChange={() => toggleDay(day)} />
                  <Label className="cursor-pointer text-sm">{day}</Label>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          <Button onClick={handleConfirm} disabled={selectedTargets.length === 0}>
            {selectedTargets.length} Güne Kopyala
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
