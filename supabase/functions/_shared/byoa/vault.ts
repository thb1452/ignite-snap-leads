// Thin wrapper around Supabase Vault RPCs for BYOA credential storage.
// Credentials are stored as a single JSON blob per (org, service).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

export async function readVaultSecret(
  admin: SupabaseClient,
  vaultSecretId: string
): Promise<Record<string, string>> {
  const { data, error } = await admin
    .from("vault.decrypted_secrets" as any)
    .select("decrypted_secret")
    .eq("id", vaultSecretId)
    .maybeSingle();
  if (error) throw new Error(`Vault read failed: ${error.message}`);
  if (!data?.decrypted_secret) throw new Error("Vault secret not found");
  try {
    return JSON.parse(data.decrypted_secret as string);
  } catch {
    throw new Error("Vault secret is not valid JSON");
  }
}

export async function createVaultSecret(
  admin: SupabaseClient,
  plaintext: string,
  name: string
): Promise<string> {
  const { data, error } = await admin.rpc("vault_create_secret" as any, {
    secret: plaintext,
    name,
  } as any);
  if (error || !data) throw new Error(`Vault create failed: ${error?.message ?? "no id returned"}`);
  return data as string;
}

export async function deleteVaultSecret(
  admin: SupabaseClient,
  vaultSecretId: string
): Promise<void> {
  const { error } = await admin.rpc("vault_delete_secret" as any, {
    secret_id: vaultSecretId,
  } as any);
  if (error) throw new Error(`Vault delete failed: ${error.message}`);
}
