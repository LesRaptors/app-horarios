"use client";

import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { validateAvatarFile, getInitials } from "@/lib/profile-helpers";
import { translateDbError } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import type { User } from "@supabase/supabase-js";

interface Props {
  profile: Profile;
  user: User;
  onUpdated: () => void | Promise<void>;
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const ERROR_ID = "avatar-card-error";

export function AvatarCard({ profile, user, onUpdated }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permitir re-seleccionar el mismo archivo
    if (!file) return;
    setError(null);
    const vErr = validateAvatarFile({ type: file.type, size: file.size });
    if (vErr) {
      setError(vErr);
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const path = `${user.id}/avatar.${EXT[file.type]}`;
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setBusy(false);
      setError(translateDbError(upErr.message));
      return;
    }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = `${pub.publicUrl}?t=${Date.now()}`; // cache-busting
    const { error: dbErr } = await supabase
      .from("profiles")
      .update({ avatar_url: url })
      .eq("id", profile.id);
    setBusy(false);
    if (dbErr) {
      setError(translateDbError(dbErr.message));
      return;
    }
    await onUpdated();
  }

  async function handleRemove() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    // Borrar posibles extensiones subidas.
    const { error: removeErr } = await supabase.storage
      .from("avatars")
      .remove([
        `${user.id}/avatar.jpg`,
        `${user.id}/avatar.png`,
        `${user.id}/avatar.webp`,
      ]);
    if (removeErr) {
      setBusy(false);
      setError(translateDbError(removeErr.message));
      return;
    }
    const { error: dbErr } = await supabase
      .from("profiles")
      .update({ avatar_url: null })
      .eq("id", profile.id);
    setBusy(false);
    if (dbErr) {
      setError(translateDbError(dbErr.message));
      return;
    }
    await onUpdated();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Foto de perfil</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar_url}
              alt="Foto de perfil"
              className="h-20 w-20 rounded-full object-cover border"
            />
          ) : (
            <div
              className="h-20 w-20 rounded-full bg-muted flex items-center justify-center text-lg font-semibold text-muted-foreground"
              aria-hidden="true"
            >
              {getInitials(profile.first_name, profile.last_name)}
            </div>
          )}
          <div className="flex flex-col gap-2">
            {/* El input permanece accesible a lectores de pantalla vía sr-only */}
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label="Seleccionar foto de perfil"
              aria-describedby={error ? ERROR_ID : undefined}
              disabled={busy}
              onChange={handleFile}
            />
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? "Procesando…" : profile.avatar_url ? "Cambiar foto" : "Subir foto"}
            </Button>
            {profile.avatar_url && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={handleRemove}
              >
                Quitar foto
              </Button>
            )}
          </div>
        </div>
        {error && (
          <p
            id={ERROR_ID}
            className="mt-3 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
