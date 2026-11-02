"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, TextField } from "@little-readers/ui";
import { apiRequest, ApiClientError } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth-storage";

interface MeResponse {
  id: string;
  name: string;
  email: string;
  role: string;
  children: Array<{
    id: string;
    displayName: string;
    birthYear: number;
    level: string;
  }>;
}

interface ChildRow {
  id: string;
  displayName: string;
  birthYear: number;
  level: string;
}

export default function ParentDashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  async function load() {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    try {
      const [user, kids] = await Promise.all([
        apiRequest<MeResponse>("/auth/me", { token }),
        apiRequest<ChildRow[]>("/children", { token }),
      ]);
      setMe(user);
      setChildren(kids);
      setError(null);
    } catch (err) {
      clearToken();
      router.replace("/login");
      if (err instanceof ApiClientError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreateChild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getToken();
    if (!token) return;
    setCreating(true);
    setError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await apiRequest("/children", {
        method: "POST",
        token,
        body: JSON.stringify({
          displayName: String(form.get("displayName") ?? ""),
          birthYear: Number(form.get("birthYear")),
        }),
      });
      formElement.reset();
      await load();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not add child"
      );
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="parent-shell">
        <div className="panel">Loading parent dashboard…</div>
      </div>
    );
  }

  return (
    <div className="parent-shell">
      <div className="panel" style={{ display: "grid", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: "0 0 6px" }}>Parent dashboard</h1>
            <p className="muted" style={{ margin: 0 }}>
              Signed in as {me?.name} ({me?.email})
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              clearToken();
              router.push("/login");
            }}
          >
            Log out
          </Button>
        </div>

        {error ? <Alert tone="error">{error}</Alert> : null}

        <section>
          <h2 style={{ marginTop: 0 }}>Child profiles</h2>
          {children.length === 0 ? (
            <p className="muted">No children yet. Add a profile below.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {children.map((child) => (
                <li key={child.id} style={{ marginBottom: 8 }}>
                  <strong>{child.displayName}</strong> · born {child.birthYear} ·{" "}
                  {child.level}
                </li>
              ))}
            </ul>
          )}
        </section>

        <form onSubmit={onCreateChild} style={{ display: "grid", gap: 12 }}>
          <h3 style={{ margin: 0 }}>Add child</h3>
          <TextField label="Display name" name="displayName" required maxLength={50} />
          <TextField
            label="Birth year"
            name="birthYear"
            type="number"
            required
            min={new Date().getFullYear() - 12}
            max={new Date().getFullYear() - 3}
          />
          <Button type="submit" loading={creating}>
            Save child profile
          </Button>
        </form>

        <Alert tone="info">
          Weekly/monthly reports, certificates and subscription management arrive
          in later phases. Phase 1 focuses on secure accounts and child profiles.
        </Alert>
      </div>
    </div>
  );
}
