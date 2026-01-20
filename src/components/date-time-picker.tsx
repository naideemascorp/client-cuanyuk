import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";

const pad2 = (n: number) => String(n).padStart(2, "0");

const toLocalValue = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

const parseLocalValue = (raw: string) => {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/\s+/g, " ").replace(" ", "T");
  const d = new Date(cleaned);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
};

const monthLabel = (d: Date) => {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
};

export function DateTimePicker(props: {
  id?: string;
  value: () => string;
  onChange: (next: string) => void;
  minValue?: () => string;
  disabled?: boolean;
}) {
  const [open, setOpen] = createSignal(false);
  const [viewMonth, setViewMonth] = createSignal<Date>(new Date());
  const [draft, setDraft] = createSignal<Date | null>(null);
  const [text, setText] = createSignal("");
  const [editing, setEditing] = createSignal(false);
  let wrapEl: HTMLDivElement | undefined;

  const minMs = createMemo(() => {
    const raw = props.minValue?.() ?? "";
    const d = parseLocalValue(raw);
    return d ? d.getTime() : null;
  });

  const openPicker = () => {
    if (props.disabled) return;
    const current = parseLocalValue(props.value()) ?? new Date();
    setDraft(current);
    setViewMonth(new Date(current.getFullYear(), current.getMonth(), 1, 0, 0, 0, 0));
    setOpen(true);
  };

  const closePicker = () => setOpen(false);

  createEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!open()) return;
      const el = wrapEl;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      closePicker();
    };
    globalThis.addEventListener("mousedown", onDown);
    onCleanup(() => globalThis.removeEventListener("mousedown", onDown));
  });

  createEffect(() => {
    if (!open()) return;
    const min = minMs();
    const d = draft();
    if (min == null || !d) return;
    if (d.getTime() > min) return;
    setDraft(new Date(min + 60_000));
  });

  const days = createMemo(() => {
    const base = viewMonth();
    const first = new Date(base.getFullYear(), base.getMonth(), 1);
    const startDay = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - startDay);
    const out: Date[] = [];
    for (let i = 0; i < 42; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      out.push(d);
    }
    return out;
  });

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const selectDay = (d: Date) => {
    const cur = draft() ?? new Date();
    const next = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      cur.getHours(),
      cur.getMinutes(),
      0,
      0,
    );
    setDraft(next);
  };

  const setTime = (hour: number, minute: number) => {
    const cur = draft() ?? new Date();
    const next = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), hour, minute, 0, 0);
    setDraft(next);
  };

  const canPick = (d: Date) => {
    const min = minMs();
    if (min == null) return true;
    const cur = draft() ?? new Date();
    const candidate = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      cur.getHours(),
      cur.getMinutes(),
      0,
      0,
    );
    return candidate.getTime() > min;
  };

  const apply = () => {
    const d = draft();
    if (!d) return;
    const min = minMs();
    if (min != null && d.getTime() <= min) return;
    props.onChange(toLocalValue(d));
    setText(
      `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
    );
    closePicker();
  };

  const display = createMemo(() => {
    const d = parseLocalValue(props.value());
    if (!d) return "";
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  });

  const draftHour = createMemo(() => draft()?.getHours() ?? 0);
  const draftMinute = createMemo(() => draft()?.getMinutes() ?? 0);

  createEffect(() => {
    if (editing()) return;
    setText(display());
  });

  const applyManual = () => {
    const d = parseLocalValue(text());
    if (!d) {
      setText(display());
      return;
    }
    const min = minMs();
    if (min != null && d.getTime() <= min) {
      setText(display());
      return;
    }
    props.onChange(toLocalValue(d));
    setDraft(d);
    setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0));
  };

  return (
    <div
      class="dtpWrap"
      ref={(el) => {
        wrapEl = el;
      }}
    >
      <input
        id={props.id}
        class="dtpInput"
        type="text"
        inputmode="numeric"
        value={text()}
        placeholder="YYYY-MM-DD HH:mm"
        onFocus={() => setEditing(true)}
        onBlur={() => {
          setEditing(false);
          applyManual();
        }}
        onInput={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            setEditing(false);
            applyManual();
            closePicker();
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setText(display());
            setEditing(false);
            closePicker();
          }
        }}
        disabled={props.disabled}
      />
      <button
        class="dtpTrigger"
        type="button"
        aria-label="Open date picker"
        disabled={props.disabled}
        onClick={openPicker}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <title>Date</title>
          <rect x="3" y="4" width="18" height="18" rx="3" />
          <path d="M8 2v4" />
          <path d="M16 2v4" />
          <path d="M3 10h18" />
        </svg>
      </button>

      <Show when={open()}>
        <div class="dtpPanel">
          <div class="dtpHeader">
            <button
              class="dtpNav"
              type="button"
              onClick={() => {
                const m = viewMonth();
                setViewMonth(new Date(m.getFullYear(), m.getMonth() - 1, 1));
              }}
              aria-label="Previous month"
            >
              ‹
            </button>
            <div class="dtpMonth">{monthLabel(viewMonth())}</div>
            <button
              class="dtpNav"
              type="button"
              onClick={() => {
                const m = viewMonth();
                setViewMonth(new Date(m.getFullYear(), m.getMonth() + 1, 1));
              }}
              aria-label="Next month"
            >
              ›
            </button>
          </div>

          <div class="dtpDow">
            <For each={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]}>
              {(d) => <div>{d}</div>}
            </For>
          </div>

          <div class="dtpGrid">
            <For each={days()}>
              {(d) => {
                const inMonth = d.getMonth() === viewMonth().getMonth();
                const cur = draft();
                const selected = cur ? isSameDay(cur, d) : false;
                const disabled = !canPick(d);
                const cls = `dtpDay ${inMonth ? "" : "dtpDay--dim"} ${selected ? "dtpDay--selected" : ""} ${disabled ? "dtpDay--disabled" : ""}`;
                return (
                  <button
                    class={cls}
                    type="button"
                    disabled={disabled}
                    onClick={() => selectDay(d)}
                    aria-label={`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`}
                  >
                    {d.getDate()}
                  </button>
                );
              }}
            </For>
          </div>

          <div class="dtpTimeRow">
            <select
              class="select dtpSelect"
              value={String(draftHour())}
              onChange={(e) => setTime(Number(e.currentTarget.value), draftMinute())}
            >
              <For each={Array.from({ length: 24 }, (_, i) => i)}>
                {(h) => <option value={String(h)}>{pad2(h)}</option>}
              </For>
            </select>
            <span class="dtpColon">:</span>
            <select
              class="select dtpSelect"
              value={String(draftMinute())}
              onChange={(e) => setTime(draftHour(), Number(e.currentTarget.value))}
            >
              <For each={Array.from({ length: 60 }, (_, i) => i)}>
                {(m) => <option value={String(m)}>{pad2(m)}</option>}
              </For>
            </select>
          </div>

          <div class="dtpActions">
            <button class="btn" type="button" onClick={closePicker}>
              Cancel
            </button>
            <button class="btn btnPrimary" type="button" onClick={apply}>
              Apply
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}
