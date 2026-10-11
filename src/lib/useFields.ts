import { useCallback, useEffect, useRef, useState } from "react";

type Values = Record<string, string>;

/** Flat string form state. `reset` loads a record once it arrives (edit forms). */
export function useFields<T extends Values>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const loaded = useRef(false);
  const bind = useCallback(
    (key: keyof T) => ({
      value: values[key] ?? "",
      onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value })),
    }),
    [values],
  );
  const set = useCallback((key: keyof T, value: string) => setValues((v) => ({ ...v, [key]: value })), []);
  return { values, bind, set, setValues, loaded };
}

/** Copies a fetched record into form state the first time it loads. */
export function useLoadRecord<T extends Values>(
  record: object | undefined,
  fields: { setValues: (fn: (v: T) => T) => void; loaded: { current: boolean } },
) {
  useEffect(() => {
    if (!record || fields.loaded.current) return;
    fields.loaded.current = true;
    fields.setValues((v) => {
      const next = { ...v };
      for (const k of Object.keys(v)) {
        const val = (record as Record<string, unknown>)[k];
        (next as Values)[k] = val === null || val === undefined ? "" : String(val);
      }
      return next;
    });
  }, [record, fields]);
}

/** "" -> null so the API clears optional fields. */
export function toPayload(values: Values): Record<string, string | null> {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim() === "" ? null : v.trim()]));
}
