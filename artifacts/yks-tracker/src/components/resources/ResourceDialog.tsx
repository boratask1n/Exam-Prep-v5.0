import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateResource,
  useUpdateResource,
  ResourceWithStats,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getLessonsForCategory, getTopicsForLesson } from "@/lib/lessonTopics";
import {
  RESOURCE_TYPES,
  CATEGORIES,
  requiresTopic,
  supportsTopic,
  type ResourceType,
} from "@/lib/resourceConfig";

// ─── Form şeması ──────────────────────────────────────────────────────────────

const formSchema = z
  .object({
    name: z.string().optional(),
    publisher: z.string().optional(),
    category: z.string().default("TYT"),
    lesson: z.string().optional(),
    topic: z.string().optional(),
    resourceType: z.string().default("Soru Bankası"),
  })
  .superRefine((data, ctx) => {
    // Ders zorunluluğu (Geometri hariç tüm türler için)
    if (data.category !== "Geometri" && !data.lesson?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lesson"],
        message: "İlgili ders seçimi zorunludur",
      });
    }
    // Konu zorunluluğu (Fasikül ve Konu Denemesi için)
    if (requiresTopic(data.resourceType) && !data.topic?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["topic"],
        message: "Bu kaynak türü için konu seçimi zorunludur",
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

// ─── Props ────────────────────────────────────────────────────────────────────

interface ResourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceForEdit?: ResourceWithStats | null;
  onCreated?: (newResourceId: number) => void;
  defaultCategory?: string;
  defaultLesson?: string;
}

// ─── Bileşen ──────────────────────────────────────────────────────────────────

export function ResourceDialog({
  open,
  onOpenChange,
  resourceForEdit,
  onCreated,
  defaultCategory = "TYT",
  defaultLesson,
}: ResourceDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!resourceForEdit;

  const createMutation = useCreateResource();
  const updateMutation = useUpdateResource();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      publisher: "",
      category: defaultCategory,
      lesson: defaultLesson ?? "",
      topic: "",
      resourceType: "Soru Bankası",
    },
  });

  const selectedCategory = form.watch("category");
  const selectedLesson = form.watch("lesson");
  const selectedTopic = form.watch("topic");
  const selectedPublisher = form.watch("publisher");
  const selectedResourceType = form.watch("resourceType") as ResourceType;

  // Konu seçiminin aktif olup olmadığı
  const topicEnabled = supportsTopic(selectedResourceType) && !!selectedLesson;
  // Konu seçiminin zorunlu olup olmadığı
  const topicRequired = requiresTopic(selectedResourceType);
  // Ders seçiminin disabled olup olmadığı
  const lessonDisabled = selectedCategory === "Geometri";

  const availableLessons = getLessonsForCategory(selectedCategory);
  const availableTopics = useMemo(() => {
    if (!selectedLesson) return [];
    return getTopicsForLesson(selectedCategory, selectedLesson);
  }, [selectedCategory, selectedLesson]);

  // Otomatik isim önerisi
  const suggestedName = useMemo(() => {
    const parts = [
      selectedPublisher?.trim(),
      selectedCategory,
      selectedLesson,
      selectedTopic ? selectedTopic : null,
      selectedResourceType,
    ].filter(Boolean);
    return parts.join(" ");
  }, [selectedPublisher, selectedCategory, selectedLesson, selectedTopic, selectedResourceType]);

  // Dialog açılınca formu sıfırla
  useEffect(() => {
    if (open) {
      if (resourceForEdit) {
        form.reset({
          name: resourceForEdit.name,
          publisher: resourceForEdit.publisher ?? "",
          category: resourceForEdit.category,
          lesson: resourceForEdit.lesson ?? "",
          topic: (resourceForEdit as any).topic ?? "",
          resourceType: resourceForEdit.resourceType,
        });
      } else {
        form.reset({
          name: "",
          publisher: "",
          category: defaultCategory,
          lesson: defaultCategory === "Geometri" ? "Geometri" : (defaultLesson ?? ""),
          topic: "",
          resourceType: "Soru Bankası",
        });
      }
    }
  }, [open, resourceForEdit, defaultCategory, defaultLesson, form]);

  const onSubmit = async (values: FormValues) => {
    try {
      const finalName =
        values.name?.trim() ||
        suggestedName ||
        `${values.category} ${values.lesson} ${values.resourceType}`;

      const payload = {
        name: finalName,
        publisher: values.publisher?.trim() || null,
        category: values.category,
        lesson: values.lesson?.trim() || null,
        topic: supportsTopic(values.resourceType)
          ? (values.topic?.trim() || null)
          : (values.resourceType === "Soru Bankası" || values.resourceType === "Ders Kitabı" ? "Tüm Konular (Genel)" : null),
        resourceType: values.resourceType,
      } as any;

      if (isEditing && resourceForEdit) {
        await updateMutation.mutateAsync({ id: resourceForEdit.id, data: payload });
        toast({ title: "Başarılı", description: "Kaynak başarıyla güncellendi." });
      } else {
        const res = await createMutation.mutateAsync({ data: payload });
        toast({ title: "Başarılı", description: "Yeni kaynak oluşturuldu." });
        if (onCreated && res?.id) {
          onCreated(res.id);
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: "Hata",
        description: err?.message || "Kaynak kaydedilirken bir sorun oluştu.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Kaynağı Düzenle" : "Yeni Kaynak Ekle"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Kaynak bilgilerini güncelleyin."
              : "Soru bankası, deneme veya fasikül kaynağınızı ekleyin."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
          {/* Kaynak Türü + Kategori */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Kaynak Türü *</Label>
              <Select
                value={form.watch("resourceType")}
                onValueChange={(val) => {
                  form.setValue("resourceType", val, { shouldValidate: true });
                  // Branş Denemesi → topic'i temizle, Soru Bankası/Ders Kitabı → "Tüm Konular (Genel)" yap
                  if (!supportsTopic(val)) {
                    form.setValue(
                      "topic",
                      val === "Soru Bankası" || val === "Ders Kitabı" ? "Tüm Konular (Genel)" : ""
                    );
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tür seçin" />
                </SelectTrigger>
                <SelectContent>
                  {RESOURCE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Kategori *</Label>
              <Select
                value={form.watch("category")}
                onValueChange={(val) => {
                  form.setValue("category", val, { shouldValidate: true });
                  form.setValue(
                    "lesson",
                    val === "Geometri" ? "Geometri" : "",
                    { shouldValidate: true }
                  );
                  form.setValue("topic", "");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kategori seçin" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* İlgili Ders */}
          <div className="space-y-1.5">
            <Label>
              İlgili Ders *
            </Label>
            <Select
              value={form.watch("lesson") || ""}
              onValueChange={(val) => {
                form.setValue("lesson", val, { shouldValidate: true });
                form.setValue("topic", "");
              }}
              disabled={lessonDisabled}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={lessonDisabled ? "Geometri" : "Ders Seçin"}
                />
              </SelectTrigger>
              <SelectContent>
                {availableLessons.map((l) => (
                  <SelectItem key={l.name} value={l.name}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.lesson && (
              <p className="text-xs text-destructive">
                {form.formState.errors.lesson.message}
              </p>
            )}
          </div>

          {/* Konu Seçimi — Branş Denemesi'nde gizli, Fasikül/Konu Denemesi'nde zorunlu */}
          {supportsTopic(selectedResourceType) && (
            <div className="space-y-1.5">
              <Label>
                Konu{" "}
                {topicRequired ? (
                  <span className="text-destructive text-xs">*</span>
                ) : (
                  <span className="text-xs text-muted-foreground font-normal">
                    (Opsiyonel — boşsa Genel)
                  </span>
                )}
              </Label>
              <Select
                value={form.watch("topic") || "NONE"}
                onValueChange={(val) =>
                  form.setValue("topic", val === "NONE" ? "" : val, {
                    shouldValidate: true,
                  })
                }
                disabled={!topicEnabled}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !selectedLesson
                        ? "Önce ders seçin"
                        : topicRequired
                        ? "Konu seçin"
                        : "Tüm Konular (Genel)"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {!topicRequired && (
                    <SelectItem value="NONE">Tüm Konular (Genel)</SelectItem>
                  )}
                  {availableTopics.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.topic && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.topic.message}
                </p>
              )}
            </div>
          )}

          {/* Yayın Evi / Kurum */}
          <div className="space-y-1.5">
            <Label htmlFor="publisher">Yayın Evi / Kurum</Label>
            <Input
              id="publisher"
              placeholder="ör. 3D Yayınları, Apotemi, Palme..."
              {...form.register("publisher")}
            />
          </div>

          {/* Kaynak Adı */}
          <div className="space-y-1.5">
            <Label htmlFor="name">Kaynak Adı</Label>
            <Input
              id="name"
              placeholder={suggestedName || "ör. 3D TYT Matematik Soru Bankası"}
              {...form.register("name")}
            />
            <p className="text-[11px] text-muted-foreground">
              Boş bırakırsanız otomatik isim önerisi kullanılır:{" "}
              <strong>{suggestedName || "Genel Kaynak"}</strong>
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              İptal
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending
                ? "Kaydediliyor..."
                : isEditing
                ? "Güncelle"
                : "Kaynak Oluştur"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
