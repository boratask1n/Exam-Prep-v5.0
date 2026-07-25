import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
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
  /** Filtrelenecek izin verilen kaynak türleri (örn: ["Soru Bankası", "Fasikül"]) */
  allowedResourceTypes?: string[];
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
  allowedResourceTypes,
  examResourceType,
  category,
  lesson,
  topic,
  className,
}: ResourceSelectProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: allResources = [], isLoading } = useListResources(undefined, {
    query: { staleTime: 60 * 1000 } as any,
  });

  const currentId = value ? Number(value) : null;

  const effectiveAllowedTypes = useMemo(() => {
    if (allowedResourceTypes && allowedResourceTypes.length > 0) return allowedResourceTypes;
    if (examResourceType) return [examResourceType];
    return null;
  }, [allowedResourceTypes, examResourceType]);

  const resources = useMemo(() => {
    let filtered = allResources;
    if (effectiveAllowedTypes) {
      filtered = filtered.filter((r) => effectiveAllowedTypes.includes(r.resourceType));
    }
    if (category) filtered = filtered.filter((r) => !r.category || r.category === category);
    if (lesson) filtered = filtered.filter((r) => !r.lesson || r.lesson === lesson);
    if (examResourceType === "Konu Denemesi" && topic) {
      filtered = filtered.filter((r) => !topic || (r as any).topic === topic || !(r as any).topic);
    }
    if (currentId && !filtered.some((r) => r.id === currentId)) {
      const sel = allResources.find((r) => r.id === currentId);
      if (sel) filtered = [sel, ...filtered];
    }
    return filtered;
  }, [allResources, effectiveAllowedTypes, category, lesson, examResourceType, topic, currentId]);

  const handleSelectChange = (val: string) => {
    if (val === "none") { onValueChange(null, undefined, null, null); return; }
    const id = Number(val);
    const selected = allResources.find((r) => r.id === id);
    onValueChange(id, selected?.name, selected?.publisher, selected);
  };

  const handleCreated = (newId: number) => {
    const selected = allResources.find((r) => r.id === newId);
    onValueChange(newId, selected?.name, selected?.publisher, selected);
  };

  const selectedResource = useMemo(
    () => (currentId ? allResources.find((r) => r.id === currentId) : null),
    [currentId, allResources]
  );

  const emptyMessage =
    resources.length === 0 && !isLoading
      ? effectiveAllowedTypes
        ? `Henüz kayıtlı "${effectiveAllowedTypes.join(", ")}" bulunmuyor. Önce Kaynaklar bölümünden ekleyin.`
        : "Henüz kayıtlı kaynak bulunmuyor."
      : null;

  return (
    <>
      <div className={`flex items-center gap-2 w-full min-w-0 overflow-hidden ${className ?? ""}`}>
        {/* Select — sabit h-10, içerik kesinlikle taşmaz */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <Select
            value={currentId ? String(currentId) : "none"}
            onValueChange={handleSelectChange}
            disabled={isLoading}
          >
            <SelectTrigger className="w-full h-10 min-w-0 overflow-hidden">
              {/*
                Radix SelectValue'yu düz bir span'ın içine sarıyoruz.
                SelectItem'larımız sade metin olduğu için Radix bunu
                trigger'da doğrudan yazı olarak koyar → truncate native çalışır,
                kaynak değiştirildiğinde asla layout bozulmaz.
              */}
              <span className="block min-w-0 overflow-hidden truncate text-sm text-left flex-1">
                <SelectValue placeholder={isLoading ? "Kaynaklar yükleniyor..." : "Kaynak Seçin *"} />
              </span>
            </SelectTrigger>

            <SelectContent className="max-w-[calc(100vw-32px)] sm:max-w-md">
              <SelectItem value="none">
                <span className="text-muted-foreground">— Kaynak seçme —</span>
              </SelectItem>
              {resources.length > 0 ? (
                <SelectGroup>
                  <SelectLabel className="text-xs font-semibold text-muted-foreground px-2 py-1">
                    {effectiveAllowedTypes ? effectiveAllowedTypes.join(", ") : "Kaynaklarınız"}
                  </SelectLabel>
                  {resources.map((r) => (
                    /* Sadece düz metin — Radix bu metni trigger'da gösterir, taşma olmaz */
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.name}{r.publisher ? ` (${r.publisher})` : ""}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ) : emptyMessage ? (
                <div className="p-3 text-center text-xs text-muted-foreground">{emptyMessage}</div>
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
          className="shrink-0 h-10 w-10 p-0"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/*
        Sabit yükseklikte bilgi satırı — kaynak seçilince/değiştirilince
        bu div'in boyutu değişmez, içindeki metin değişir sadece.
      */}
      <div className="h-5 flex items-center overflow-hidden min-w-0">
        {selectedResource ? (
          <p className="text-xs text-muted-foreground truncate min-w-0">
            📚 {selectedResource.resourceType}
            {selectedResource.lesson ? ` · ${selectedResource.lesson}` : ""}
          </p>
        ) : null}
      </div>

      <ResourceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={handleCreated}
        defaultCategory={category ?? "TYT"}
        defaultLesson={lesson}
        defaultResourceType={effectiveAllowedTypes?.[0]}
      />
    </>
  );
}
