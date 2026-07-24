import { useState } from "react";
import { Plus, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useListResources } from "@workspace/api-client-react";
import { ResourceDialog } from "./ResourceDialog";
import { type ExamResourceType } from "@/lib/resourceConfig";

interface ResourceSelectProps {
  value?: number | string | null;
  onValueChange: (
    resourceId: number | null,
    resourceName?: string,
    publisher?: string | null,
    resourceObj?: any
  ) => void;
  /** Branş veya Konu denemesi için filtreleme türü */
  examResourceType?: ExamResourceType;
  category?: string;
  lesson?: string;
  topic?: string;
  className?: string;
}

export function ResourceSelect({
  value,
  onValueChange,
  examResourceType,
  category,
  lesson,
  topic,
  className,
}: ResourceSelectProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  // API'ye resourceType filtresi gönder
  const { data: allResources = [], isLoading } = useListResources(
    {
      category: category || undefined,
      lesson: lesson || undefined,
      resourceType: examResourceType || undefined,
    },
    {
      query: {
        staleTime: 60 * 1000,
      } as any,
    }
  );

  // Konu Denemesi için ek frontend filtresi (topic eşleşmesi)
  const resources =
    examResourceType === "Konu Denemesi" && topic
      ? allResources.filter((r) => !topic || (r as any).topic === topic || !(r as any).topic)
      : allResources;

  const currentId = value ? Number(value) : null;

  const handleSelectChange = (val: string) => {
    if (val === "none") {
      onValueChange(null, undefined, null, null);
      return;
    }
    const id = Number(val);
    const selected = resources.find((r) => r.id === id);
    onValueChange(id, selected?.name, selected?.publisher, selected);
  };

  const handleCreated = (newId: number) => {
    const selected = resources.find((r) => r.id === newId);
    onValueChange(newId, selected?.name, selected?.publisher, selected);
  };

  const emptyMessage =
    resources.length === 0 && !isLoading
      ? examResourceType
        ? `Henüz kayıtlı "${examResourceType}" bulunmuyor. Önce Kaynaklar bölümünden ekleyin.`
        : "Henüz kayıtlı kaynak bulunmuyor."
      : null;

  return (
    <>
      <div className={`flex items-center gap-2 ${className ?? ""}`}>
        <div className="flex-1">
          <Select
            value={currentId ? String(currentId) : "none"}
            onValueChange={handleSelectChange}
            disabled={isLoading}
          >
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={isLoading ? "Kaynaklar yükleniyor..." : "Kaynak Seçin *"}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <span className="text-muted-foreground">— Kaynak seçme —</span>
              </SelectItem>
              {resources.length > 0 ? (
                <SelectGroup>
                  <SelectLabel className="text-xs font-semibold text-muted-foreground px-2 py-1">
                    {examResourceType ?? "Kaynaklarınız"}
                  </SelectLabel>
                  {resources.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="font-medium">{r.name}</span>
                        {r.publisher && (
                          <span className="text-xs text-muted-foreground">({r.publisher})</span>
                        )}
                        {(r as any).topic && (
                          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded ml-auto">
                            {(r as any).topic}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>
              ) : emptyMessage ? (
                <div className="p-3 text-center text-xs text-muted-foreground">
                  {emptyMessage}
                </div>
              ) : null}
            </SelectContent>
          </Select>
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon"
          title="Yeni Kaynak Ekle"
          onClick={() => setDialogOpen(true)}
          className="shrink-0 h-10 w-10"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <ResourceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={handleCreated}
        defaultCategory={category ?? "TYT"}
        defaultLesson={lesson}
      />
    </>
  );
}
