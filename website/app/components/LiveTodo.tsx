"use client";
import { useState } from "react";

// The shared dashboard's "UP NEXT" agenda, made genuinely interactive: real
// <input type="checkbox"> semantics (native keyboard + screen-reader
// behaviour, label association), a quick check-mark draw-on, and a
// strike-through on completion — a miniature of the app's real to-do block.
// Copy is unchanged from the static mock: same two items, same order.

type Item = { id: string; label: string; meta: string; done: boolean };

const INITIAL: Item[] = [
  { id: "market", label: "Farmers’ market", meta: "Saturday · 10 am", done: false },
  { id: "movie", label: "Movie night", meta: "Friday · 8 pm", done: false },
];

export default function LiveTodo() {
  const [items, setItems] = useState<Item[]>(INITIAL);

  function toggle(id: string) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, done: !it.done } : it)));
  }

  return (
    <ul className="todo-list" aria-label="Shared to-dos — try ticking one off">
      {items.map((it) => (
        <li key={it.id} className={`todo-item${it.done ? " is-done" : ""}`}>
          <label className="todo-row">
            <input
              type="checkbox"
              className="todo-input"
              checked={it.done}
              onChange={() => toggle(it.id)}
            />
            <span className="todo-box" aria-hidden="true">
              <svg className="icon" viewBox="0 0 24 24">
                <path d="M5 12l4.5 4.5L19 7" />
              </svg>
            </span>
            <span className="todo-copy">
              <strong className="todo-label">{it.label}</strong>
              <small className="todo-meta">{it.meta}</small>
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}
