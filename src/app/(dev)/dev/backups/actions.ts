"use server";

import { getSession, hasRole } from "@/lib/auth";
import {
  createBackup,
  listBackups,
  restoreFromBackup,
  deleteBackup,
  type BackupMeta,
  type RestoreResult,
} from "@/lib/backup";

async function requireDev() {
  const session = await getSession();
  if (!session || !hasRole(session, "dev")) {
    throw new Error("Unauthorized");
  }
}

export async function triggerBackup(): Promise<BackupMeta> {
  await requireDev();
  return createBackup();
}

export async function getBackupList(): Promise<BackupMeta[]> {
  await requireDev();
  return listBackups();
}

export async function restoreBackup(url: string): Promise<RestoreResult> {
  await requireDev();
  return restoreFromBackup(url);
}

export async function getBackupContent(url: string): Promise<string> {
  await requireDev();
  const res = await fetch(url);
  return res.text();
}

export async function removeBackup(url: string): Promise<void> {
  await requireDev();
  return deleteBackup(url);
}
