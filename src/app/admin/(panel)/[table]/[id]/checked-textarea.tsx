"use client";

import { useState } from "react";
import { textProblems } from "@/lib/text-checks";
import a from "../../../admin.module.css";

// A textarea that warns, as you type or paste, about text that will read badly.
// It only warns; saving is never blocked.
export default function CheckedTextarea({
  name,
  defaultValue,
  rows,
  required,
}: {
  name: string;
  defaultValue: string;
  rows: number;
  required?: boolean;
}) {
  const [problems, setProblems] = useState(() => textProblems(defaultValue));

  return (
    <>
      <textarea
        name={name}
        defaultValue={defaultValue}
        rows={rows}
        required={required}
        onChange={(e) => setProblems(textProblems(e.target.value))}
      />
      {problems.length > 0 && (
        <div className={a.warn} role="status">
          <p>Check this text before saving:</p>
          <ul>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
