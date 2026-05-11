import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useState } from "react";
import { templates, type TemplateDto } from "@/api/messageTemplates";
import { Pencil, Trash2 } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Button from "@/components/ui/Button";
import SetupNav from "@/components/shell/SetupNav";

export default function MessageTemplatesPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["templates", eventId], queryFn: () => templates.list(eventId!), enabled: !!eventId });

  const [draft, setDraft] = useState("");
  const create = useMutation({
    mutationFn: () => templates.create(eventId!, draft.trim(), 0),
    onSuccess: () => { setDraft(""); qc.invalidateQueries({ queryKey: ["templates", eventId] }); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => templates.remove(eventId!, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates", eventId] }),
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [pendingDelete, setPendingDelete] = useState<TemplateDto | null>(null);
  const update = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => templates.update(eventId!, id, text, 0),
    onSuccess: () => { setEditingId(null); qc.invalidateQueries({ queryKey: ["templates", eventId] }); },
  });

  if (!eventId) return <div className="p-8 text-red-400">Missing event id.</div>;

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <SetupNav eventId={eventId} />
      <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Message templates</h1>

      <div className="flex gap-2">
        <input
          value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="New template…"
          className="flex-1 px-3 py-2 rounded bg-zinc-950/60 border border-white/10" />
        <Button disabled={!draft.trim()} onClick={() => create.mutate()}>Add</Button>
      </div>

      <ul className="rounded-xl border border-white/5 divide-y divide-white/5">
        {(list.data ?? []).map((t: TemplateDto) => (
          <li key={t.id} className="flex items-center gap-2 p-3">
            {editingId === t.id ? (
              <>
                <input value={editingText} onChange={(e) => setEditingText(e.target.value)}
                  className="flex-1 px-2 py-1 rounded bg-zinc-950/60 border border-white/10" />
                <Button size="sm" onClick={() => update.mutate({ id: t.id, text: editingText })}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
              </>
            ) : (
              <>
                <span className="flex-1">{t.text}</span>
                <button onClick={() => { setEditingId(t.id); setEditingText(t.text); }}
                  className="text-zinc-500 hover:text-zinc-300"><Pencil className="size-4" /></button>
                <button onClick={() => setPendingDelete(t)}
                  className="text-zinc-500 hover:text-red-400"><Trash2 className="size-4" /></button>
              </>
            )}
          </li>
        ))}
        {list.data?.length === 0 && <li className="p-6 text-center text-sm text-zinc-500">
  Templates are reusable messages you can send to speakers in one tap. Try "Wrap up" or "5 min left".
</li>}
      </ul>
      <ConfirmDialog
        open={pendingDelete !== null}
        tone="danger"
        title="Delete template?"
        message={pendingDelete ? <>"{pendingDelete.text}" will be removed.</> : ""}
        confirmLabel="Delete"
        onConfirm={() => {
          if (pendingDelete) remove.mutate(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
      </div>
    </div>
  );
}
