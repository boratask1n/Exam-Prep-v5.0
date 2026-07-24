import { StickyNote } from "lucide-react";
import { useLocation } from "wouter";
import { PageHeader, PageShell } from "@/components/layout/PageShell";
import { NotesReelsView } from "@/components/notes/NotesReelsView";

function getPendingOpenNoteKey(category: "TYT" | "AYT") {
  return `yks_notes_pending_open_${category.toLowerCase()}`;
}

type FeedNote = {
  id: string;
  category: "TYT" | "AYT";
  lesson: string;
};

export default function NotesFeed() {
  const [, navigate] = useLocation();

  return (
    <PageShell maxWidthClassName="max-w-6xl" contentClassName="gap-4">
      <PageHeader
        icon={<StickyNote className="h-5 w-5" />}
        title="Not Akışı"
        description="Tüm TYT ve AYT notlarını, aktif geri çağırma mantığıyla karışık sırada önüne getirir."
      />

      <div>
        <NotesReelsView
          searchTerm=""
          reloadSeed={0}
          onOpenNote={(note: FeedNote) => {
            window.sessionStorage.setItem(
              getPendingOpenNoteKey(note.category),
              JSON.stringify({ id: note.id, lesson: note.lesson }),
            );
            navigate(`/notes/${note.category.toLowerCase()}`);
          }}
        />
      </div>
    </PageShell>
  );
}
