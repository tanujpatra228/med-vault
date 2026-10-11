import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/Field";
import { Wordmark } from "@/components/Mark";

export function Login() {
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/login", { password });
      await qc.invalidateQueries({ queryKey: ["auth"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col justify-center px-5 py-12">
      <Wordmark />
      <h1 className="mt-12 mb-10 statement-lg">Every prescription, report and medicine for your family, in one place.</h1>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <Field label="Family password">
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!error}
            autoFocus
          />
        </Field>
        {error && <p className="type-label text-rust">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy || !password}>
          {busy ? "Opening" : "Open the vault"}
        </Button>
      </form>
    </main>
  );
}
