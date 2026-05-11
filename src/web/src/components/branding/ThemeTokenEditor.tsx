import { tokenSpecs, type TokenSpec } from "@/theme/defaults";

interface Props {
  overrides: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}

const groupOrder: TokenSpec["group"][] = ["Brand", "Status", "Message", "Background", "Text"];

export default function ThemeTokenEditor({ overrides, onChange }: Props) {
  const grouped = groupOrder.map((g) => ({ group: g, tokens: tokenSpecs.filter((t) => t.group === g) }));

  function setToken(key: string, value: string) {
    onChange({ ...overrides, [key]: value });
  }
  function clearToken(key: string) {
    const next = { ...overrides };
    delete next[key];
    onChange(next);
  }

  return (
    <div className="space-y-6">
      {grouped.map(({ group, tokens }) => (
        <section key={group}>
          <h3 className="text-xs uppercase tracking-widest text-zinc-500 mb-2">{group}</h3>
          <ul className="space-y-2">
            {tokens.map((t) => {
              const current = overrides[t.key] ?? t.value;
              const isOverridden = overrides[t.key] !== undefined;
              return (
                <li key={t.key} className="flex items-start gap-3 rounded border border-zinc-800 bg-zinc-900 p-3">
                  <input
                    type="color"
                    value={current}
                    onChange={(e) => setToken(t.key, e.target.value)}
                    className="h-10 w-10 cursor-pointer rounded border border-zinc-800 bg-transparent"
                    aria-label={`${t.label} color`}
                  />
                  <div className="flex-1">
                    <div className="flex items-baseline justify-between">
                      <label className="text-sm font-medium">{t.label}</label>
                      <input
                        type="text"
                        value={current}
                        onChange={(e) => setToken(t.key, e.target.value)}
                        className="w-28 rounded bg-zinc-950 border border-zinc-800 px-2 py-1 font-mono text-xs"
                      />
                    </div>
                    {t.description && <p className="mt-1 text-xs text-zinc-500">{t.description}</p>}
                    {isOverridden && (
                      <button
                        type="button"
                        onClick={() => clearToken(t.key)}
                        className="mt-1 text-xs text-zinc-500 hover:text-zinc-300 underline"
                      >
                        Reset to default ({t.value})
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
