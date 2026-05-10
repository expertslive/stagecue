import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import { templates, type TemplateDto } from "@/api/messageTemplates";
import { Pencil, Trash2 } from "lucide-react";

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
  const update = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => templates.update(eventId!, id, text, 0),
    onSuccess: () => { setEditingId(null); qc.invalidateQueries({ queryKey: ["templates", eventId] }); },
  });

  if (!eventId) return <div className="p-8 text-red-400">Missing event id.</div>;

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <Link to={`/events/${eventId}`} className="text-sm text-zinc-400 hover:text-zinc-200">← Event</Link>
      <h1 className="text-2xl font-semibold">Message templates</h1>

      <div className="flex gap-2">
        <input
          value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="New template…"
          className="flex-1 px-3 py-2 rounded bg-zinc-900 border border-zinc-800" />
        <button
          disabled={!draft.trim()}
          onClick={() => create.mutate()}
          className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm disabled:opacity-50">Add</button>
      </div>

      <ul className="rounded border border-zinc-800 divide-y divide-zinc-800">
        {(list.data ?? []).map((t: TemplateDto) => (
          <li key={t.id} className="flex items-center gap-2 p-3">
            {editingId === t.id ? (
              <>
                <input value={editingText} onChange={(e) => setEditingText(e.target.value)}
                  className="flex-1 px-2 py-1 rounded bg-zinc-900 border border-zinc-800" />
                <button onClick={() => update.mutate({ id: t.id, text: editingText })}
                  className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-sm">Save</button>
                <button onClick={() => setEditingId(null)} className="text-zinc-500">Cancel</button>
              </>
            ) : (
              <>
                <span className="flex-1">{t.text}</span>
                <button onClick={() => { setEditingId(t.id); setEditingText(t.text); }}
                  className="text-zinc-500 hover:text-zinc-300"><Pencil className="size-4" /></button>
                <button onClick={() => { if (confirm(`Delete "${t.text}"?`)) remove.mutate(t.id); }}
                  className="text-zinc-500 hover:text-red-400"><Trash2 className="size-4" /></button>
              </>
            )}
          </li>
        ))}
        {list.data?.length === 0 && <li className="p-3 text-sm text-zinc-500">No templates yet.</li>}
      </ul>
    </div>
  );
}
