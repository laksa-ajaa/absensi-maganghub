import { db } from "@/lib/db";
import { executeUserDailySubmit } from "@/lib/submit-orchestrator";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

function isAuthorized(request: Request): boolean {
  const configuredSecret = process.env.CRON_SCHEDULER_SECRET;
  const authorization = request.headers.get("authorization") || "";

  return Boolean(configuredSecret && authorization === `Bearer ${configuredSecret}`);
}

function getScheduleParts(timezone: string): {
  time: string;
  dayOfWeek: string;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  const weekdayNumbers: Record<string, string> = {
    Sun: "0",
    Mon: "1",
    Tue: "2",
    Wed: "3",
    Thu: "4",
    Fri: "5",
    Sat: "6",
  };

  return {
    time: `${values.hour}:${values.minute}`,
    dayOfWeek: weekdayNumbers[values.weekday] || "-1",
  };
}

async function runScheduler(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const configs = await db.automationConfig.findMany({
      where: { isEnabled: true },
      select: {
        userId: true,
        scheduleTime: true,
        scheduleDays: true,
        timezone: true,
      },
    });

    const dueConfigs = configs.filter((config) => {
      const schedule = getScheduleParts(config.timezone || "Asia/Jakarta");
      const allowedDays = (config.scheduleDays || "1,2,3,4,5,6")
        .split(",")
        .map((day) => day.trim());

      return (
        schedule.time === config.scheduleTime &&
        allowedDays.includes(schedule.dayOfWeek)
      );
    });

    const results: Array<{
      userId: string;
      success: boolean;
      message: string;
      httpCode?: number;
      reportId?: string;
    }> = [];
    for (const config of dueConfigs) {
      const now = new Date();
      await db.automationRunLock.deleteMany({
        where: {
          userId: config.userId,
          expiresAt: { lt: now },
        },
      });

      let lockId: string;
      try {
        const lock = await db.automationRunLock.create({
          data: {
            userId: config.userId,
            expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
          },
        });
        lockId = lock.id;
      } catch (error) {
        // Unique constraint means another scheduler request is processing this user.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          results.push({
            userId: config.userId,
            success: true,
            message: "Dilewati karena user sedang diproses oleh scheduler lain.",
          });
          continue;
        }
        throw error;
      }

      try {
        const result = await executeUserDailySubmit(config.userId, "CRON_WEBHOOK");
        results.push({ userId: config.userId, ...result });
      } catch (error) {
        results.push({
          userId: config.userId,
          success: false,
          message: error instanceof Error ? error.message : "Scheduler execution failed",
        });
      } finally {
        await db.automationRunLock.delete({ where: { id: lockId } });
      }
    }

    return NextResponse.json({
      success: true,
      checked: configs.length,
      executed: dueConfigs.length,
      results,
    });
  } catch (error) {
    console.error("Cron scheduler error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal scheduler error" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return runScheduler(request);
}

export async function POST(request: Request) {
  return runScheduler(request);
}
