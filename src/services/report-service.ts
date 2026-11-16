import { db } from "@/services/db";
import type { SaveReportPayload, ReportItem } from "@/schemas/report-schema";
import { safeCache } from "@/lib/cache";
import { decrypt } from "@/lib/crypto";
import { MagangHubApiClient } from "@/lib/maganghub-api";

async function fetchLocalUserReports(userId: string): Promise<ReportItem[]> {
  const reports = await db.report.findMany({
    where: { userId },
    orderBy: { date: "desc" },
  });

  return reports.map((r) => ({
    id: r.id,
    date: r.date.toISOString().split("T")[0],
    activity: r.activity,
    learning: r.learning,
    obstacles: r.obstacles,
    status: r.status as ReportItem["status"],
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

function remoteText(record: RemoteRecord, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "Belum ada isi laporan untuk bagian ini.";
}

function remoteReport(record: RemoteRecord): ReportItem | null {
  const date = remoteDate(record);
  if (!date) return null;

  const createdAtValue = record.created_at ?? record.createdAt;
  const updatedAtValue = record.updated_at ?? record.updatedAt;
  const createdAt = typeof createdAtValue === "string" ? new Date(createdAtValue) : undefined;
  const updatedAt = typeof updatedAtValue === "string" ? new Date(updatedAtValue) : undefined;

  const normalizedStatus = remoteStatus(record);

  return {
    id: `monev-${String(record.id ?? date)}`,
    date,
    activity: remoteText(record, "activity_log", "activity", "description"),
    learning: remoteText(record, "lesson_learned", "learning", "lessonLearned"),
    obstacles: remoteText(record, "obstacles", "obstacle"),
    sourceType: "Monev API",
    status: normalizedStatus === "READY" ? "DRAFT" : normalizedStatus,
    createdAt: createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : undefined,
    updatedAt: updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : undefined,
  };
}

async function fetchRemoteHistoryReports(userId: string, requestedDate?: string): Promise<ReportItem[]> {
  const credential = await db.maganghubCredential.findUnique({
    where: { userId },
    select: { encryptedPassword: true, iv: true, authTag: true },
  });
  if (!credential) return [];

  try {
    const { email, password } = JSON.parse(
      decrypt(credential.encryptedPassword, credential.iv, credential.authTag)
    ) as { email: string; password: string };
    const authResult = await MagangHubApiClient.login(email, password);
    const profileResult = await MagangHubApiClient.getCurrentUser(authResult.accessToken);
    if (!profileResult.success) return [];

    const participantId = findParticipantId(unwrapRecords(profileResult.data)[0]);
    if (!participantId) return [];

    // The endpoint accepts one `date` value but returns the daily-log history
    // around that period. Query recent months so the history page is not
    // limited to reports that exist only in the local database.
    const now = new Date();
    const queryDates = requestedDate
      ? [requestedDate]
      : Array.from({ length: 12 }, (_, index) => {
          const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
        });
    const requests = queryDates.map((date) =>
      MagangHubApiClient.getDailyLogs(authResult.accessToken, {
        participantId,
        date,
        limit: 100,
      })
    );
    const results = await Promise.all(requests);
    const byDate = new Map<string, ReportItem>();
    for (const result of results) {
      if (!result.success) continue;
      for (const record of unwrapRecords(result.data)) {
        const report = remoteReport(record);
        if (report) byDate.set(report.date, report);
      }
    }
    return Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));
  } catch (error) {
    console.warn("Monev history sync fallback to local data:", error);
    return [];
  }
}

async function fetchUserReports(userId: string): Promise<ReportItem[]> {
  const localReports = await fetchLocalUserReports(userId);
  const remoteReports = await fetchRemoteHistoryReports(userId);
  if (remoteReports.length === 0) return localReports;

  const merged = new Map(localReports.map((report) => [report.date, report]));
  for (const remoteReportItem of remoteReports) {
    const local = merged.get(remoteReportItem.date);
    // Keep locally edited text when available, while remote status and
    // timestamps remain authoritative for submitted reports.
    merged.set(remoteReportItem.date, {
      ...remoteReportItem,
      ...(local
        ? {
            id: local.id,
            activity: local.activity || remoteReportItem.activity,
            learning: local.learning || remoteReportItem.learning,
            obstacles: local.obstacles || remoteReportItem.obstacles,
            sourceType: local.sourceType || remoteReportItem.sourceType,
          }
        : {}),
    });
  }
  return Array.from(merged.values()).sort((a, b) => b.date.localeCompare(a.date));
}

export async function getUserReports(userId: string): Promise<ReportItem[]> {
  return safeCache(
    () => fetchUserReports(userId),
    ["user-reports", userId],
    {
      tags: [`reports-${userId}`],
      revalidate: 120,
    }
  )();
}

export async function getRecentReports(
  userId: string,
  limit = 5
): Promise<ReportItem[]> {
  const reports = await db.report.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    take: limit,
  });

  return reports.map((r) => ({
    id: r.id,
    date: r.date.toISOString().split("T")[0],
    activity: r.activity,
    learning: r.learning,
    obstacles: r.obstacles,
    status: r.status as ReportItem["status"],
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export interface CalendarReportItem {
  date: string;
  status: "DRAFT" | "READY" | "SUBMITTED" | "FAILED";
}

type RemoteRecord = Record<string, unknown>;

function unwrapRecords(value: unknown): RemoteRecord[] {
  const root = value as RemoteRecord | null;
  const candidate = root && typeof root === "object"
    ? root.data ?? root.items ?? root.records ?? root.results ?? root
    : value;

  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    const nested = candidate as RemoteRecord;
    const nestedCollection = nested.data ?? nested.items ?? nested.records ?? nested.results;
    if (nestedCollection) return unwrapRecords(nestedCollection);
  }

  if (Array.isArray(candidate)) {
    return candidate.filter((item): item is RemoteRecord => !!item && typeof item === "object");
  }
  return candidate && typeof candidate === "object" ? [candidate as RemoteRecord] : [];
}

function findParticipantId(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const record = value as RemoteRecord;
  const direct = record.participant_id ?? record.participantId;
  if (typeof direct === "string" && direct) return direct;
  for (const child of Object.values(record)) {
    const found = findParticipantId(child);
    if (found) return found;
  }
  return typeof record.id === "string" ? record.id : "";
}

function remoteDate(record: RemoteRecord): string | null {
  const raw = record.date ?? record.attendance_date ?? record.attendanceDate ?? record.log_date ?? record.logDate ?? record.work_date ?? record.created_at;
  if (typeof raw !== "string") return null;
  return raw.slice(0, 10);
}

function remoteStatus(record: RemoteRecord): CalendarReportItem["status"] {
  const status = String(record.status ?? record.state ?? record.attendance_status ?? record.attendanceStatus ?? record.approval_status ?? "").toUpperCase();
  if (["FAILED", "REJECTED", "DENIED", "ERROR"].includes(status)) return "FAILED";
  if (["DRAFT", "PENDING", "WAITING"].includes(status)) return "DRAFT";
  if (
    ["SUBMITTED", "PRESENT", "APPROVED", "COMPLETED", "SUCCESS"].includes(status) ||
    record.check_in || record.check_out || record.clock_in || record.clock_out
  ) {
    return "SUBMITTED";
  }
  return "READY";
}

async function fetchRemoteCalendarReports(
  userId: string,
  startDateStr?: string,
  endDateStr?: string
): Promise<CalendarReportItem[] | null> {
  const credential = await db.maganghubCredential.findUnique({
    where: { userId },
    select: { encryptedPassword: true, iv: true, authTag: true },
  });
  if (!credential) return null;

  try {
    const { email, password } = JSON.parse(
      decrypt(credential.encryptedPassword, credential.iv, credential.authTag)
    ) as { email: string; password: string };
    const authResult = await MagangHubApiClient.login(email, password);
    const profileResult = await MagangHubApiClient.getCurrentUser(authResult.accessToken);
    if (!profileResult.success) return null;

    const profile = unwrapRecords(profileResult.data)[0] || {};
    const participantId = findParticipantId(profile);
    if (!participantId) return null;

    const end = endDateStr ? new Date(`${endDateStr}T12:00:00Z`) : new Date();
    const endDate = endDateStr || end.toISOString().slice(0, 10);
    // Monev accepts a bounded date window; keep the default request within
    // the same rolling ~30-day range used by its calendar UI.
    const start = new Date(end);
    start.setDate(start.getDate() - 30);
    const startDate = startDateStr || start.toISOString().slice(0, 10);
    const attendanceResult = await MagangHubApiClient.getAttendances(authResult.accessToken, {
      participantId,
      startDate,
      endDate,
    });

    // Also fetch the daily-log endpoint so the sync uses the same source as
    // the Monev UI. Its records are intentionally not persisted blindly: the
    // local Report model contains generated/editable text that must be kept.
    await MagangHubApiClient.getDailyLogs(authResult.accessToken, {
      participantId,
      date: startDate,
      limit: 100,
    });

    if (!attendanceResult.success) return null;
    return unwrapRecords(attendanceResult.data)
      .map((record) => {
        const date = remoteDate(record);
        return date ? { date, status: remoteStatus(record) } : null;
      })
      .filter((item): item is CalendarReportItem => item !== null);
  } catch (error) {
    console.warn("Monev calendar sync fallback to local data:", error);
    return null;
  }
}

async function fetchCalendarReports(
  userId: string,
  startDateStr?: string,
  endDateStr?: string
): Promise<CalendarReportItem[]> {
  const filterDate = startDateStr
    ? new Date(startDateStr)
    : (() => {
        const d = new Date();
        d.setFullYear(d.getFullYear() - 1);
        d.setHours(0, 0, 0, 0);
        return d;
      })();

  const reports = await db.report.findMany({
    where: {
      userId,
      date: {
        gte: filterDate,
        ...(endDateStr ? { lte: new Date(`${endDateStr}T12:00:00Z`) } : {}),
      },
    },
    select: {
      date: true,
      status: true,
    },
    orderBy: { date: "asc" },
  });

  const localReports = reports.map((r) => ({
    date: r.date.toISOString().split("T")[0],
    status: r.status as CalendarReportItem["status"],
  }));

  const remoteReports = await fetchRemoteCalendarReports(userId, startDateStr, endDateStr);
  if (!remoteReports) return localReports;

  const merged = new Map(localReports.map((report) => [report.date, report]));
  for (const report of remoteReports) {
    merged.set(report.date, report);
  }
  return Array.from(merged.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function getCalendarReports(
  userId: string,
  startDate?: Date
): Promise<CalendarReportItem[]> {
  const startDateStr = startDate ? startDate.toISOString().split("T")[0] : undefined;
  return safeCache(
    () => fetchCalendarReports(userId, startDateStr),
    ["calendar-reports-v2-monev", userId, startDateStr || "default"],
    {
      tags: [`reports-${userId}`],
      revalidate: 300,
    }
  )();
}

export async function getCalendarReportsForDateRange(
  userId: string,
  startDateStr: string,
  endDateStr: string
): Promise<CalendarReportItem[]> {
  return safeCache(
    () => fetchCalendarReports(userId, startDateStr, endDateStr),
    ["calendar-reports-range-v1", userId, startDateStr, endDateStr],
    {
      tags: [`reports-${userId}`],
      revalidate: 300,
    }
  )();
}

async function fetchReportByDate(
  userId: string,
  dateStr: string
): Promise<ReportItem | null> {
  const dateObj = new Date(dateStr);
  const report = await db.report.findUnique({
    where: {
      userId_date: {
        userId,
        date: dateObj,
      },
    },
  });

  if (!report) return null;

  return {
    id: report.id,
    date: dateStr,
    activity: report.activity,
    learning: report.learning,
    obstacles: report.obstacles,
    status: report.status as ReportItem["status"],
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}

async function fetchReportByDateWithRemoteFallback(
  userId: string,
  dateStr: string
): Promise<ReportItem | null> {
  const localReport = await fetchReportByDate(userId, dateStr);
  if (localReport) return localReport;

  const remoteReports = await fetchRemoteHistoryReports(userId, dateStr);
  return remoteReports.find((report) => report.date === dateStr) || null;
}

export async function getReportByDate(
  userId: string,
  dateStr: string
): Promise<ReportItem | null> {
  return safeCache(
    () => fetchReportByDateWithRemoteFallback(userId, dateStr),
    ["report-by-date", userId, dateStr],
    {
      tags: [`reports-${userId}`],
      revalidate: 60,
    }
  )();
}

export async function getReportById(
  id: string,
  userId: string
): Promise<ReportItem | null> {
  const report = await db.report.findFirst({
    where: { id, userId },
  });

  if (!report) return null;

  return {
    id: report.id,
    date: report.date.toISOString().split("T")[0],
    activity: report.activity,
    learning: report.learning,
    obstacles: report.obstacles,
    status: report.status as ReportItem["status"],
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}

export async function saveReport(
  userId: string,
  payload: SaveReportPayload
): Promise<ReportItem> {
  const dateObj = new Date(payload.date);
  const report = await db.report.upsert({
    where: {
      userId_date: {
        userId,
        date: dateObj,
      },
    },
    update: {
      activity: payload.activity,
      learning: payload.learning,
      obstacles: payload.obstacles,
    },
    create: {
      userId,
      date: dateObj,
      activity: payload.activity,
      learning: payload.learning,
      obstacles: payload.obstacles,
      status: "DRAFT",
    },
  });

  return {
    id: report.id,
    date: payload.date,
    activity: report.activity,
    learning: report.learning,
    obstacles: report.obstacles,
    status: report.status as ReportItem["status"],
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}

export async function deleteReport(id: string, userId: string): Promise<void> {
  await db.submitLog.deleteMany({
    where: { reportId: id },
  });

  await db.report.delete({
    where: { id, userId },
  });
}
