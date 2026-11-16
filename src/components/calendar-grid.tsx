"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchCalendarReportsForMonth } from "@/actions/report-actions";

export interface CalendarDayReport {
  date: string; // YYYY-MM-DD
  status: "DRAFT" | "READY" | "SUBMITTED" | "FAILED";
  activity?: string;
}

interface CalendarGridProps {
  reports: CalendarDayReport[];
  onSelectDate?: (date: string) => void;
}

export function CalendarGrid({ reports, onSelectDate }: CalendarGridProps) {
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [visibleReports, setVisibleReports] = useState(reports);
  const [isLoading, setIsLoading] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];

  const loadMonth = async (nextDate: Date) => {
    const nextYear = nextDate.getFullYear();
    const nextMonth = nextDate.getMonth();
    const startDate = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(nextYear, nextMonth + 1, 0).getDate();
    const endDate = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    setCurrentDate(nextDate);
    setIsLoading(true);
    try {
      setVisibleReports(await fetchCalendarReportsForMonth(startDate, endDate));
    } finally {
      setIsLoading(false);
    }
  };

  const prevMonth = () => loadMonth(new Date(year, month - 1, 1));
  const nextMonth = () => loadMonth(new Date(year, month + 1, 1));

  // Map reports by date string
  const reportsMap = new Map<string, CalendarDayReport>();
  visibleReports.forEach((r) => {
    reportsMap.set(r.date, r);
  });

  const days = [];
  // Empty slots before first day
  for (let i = 0; i < firstDayIndex; i++) {
    days.push(null);
  }
  // Days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    const dStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    days.push({
      dayNumber: day,
      dateString: dStr,
      report: reportsMap.get(dStr),
    });
  }

  return (
    <div className="bg-canvas-subtle border border-hairline rounded-md p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-3">
          <h2 className="text-xs sm:text-sm font-semibold text-ink-primary">
            {monthNames[month]} {year}
            {isLoading && <span className="ml-2 text-primary animate-pulse">Memuat...</span>}
          </h2>
          <span className="text-[11px] sm:text-xs text-ink-muted">
            Kalender Kehadiran &amp; Laporan
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={prevMonth}
            className="h-8 w-8 sm:h-7 sm:w-7 p-0"
            aria-label="Bulan Sebelumnya"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={nextMonth}
            className="h-8 w-8 sm:h-7 sm:w-7 p-0"
            aria-label="Bulan Berikutnya"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center text-[10px] sm:text-[11px] font-medium text-ink-muted">
        <div>Min</div>
        <div>Sen</div>
        <div>Sel</div>
        <div>Rab</div>
        <div>Kam</div>
        <div>Jum</div>
        <div>Sab</div>
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {days.map((d, index) => {
          if (!d) {
            return (
              <div
                key={`empty-${index}`}
                className="h-14 sm:h-16 rounded-xs sm:rounded-sm bg-transparent"
              />
            );
          }

          const isSubmitted = d.report?.status === "SUBMITTED";
          const isDraft = d.report?.status === "DRAFT";
          const isReady = d.report?.status === "READY";
          const isFailed = d.report?.status === "FAILED";
          const statusLabel = isSubmitted
            ? "Terkirim"
            : isFailed
            ? "Gagal"
            : isDraft
            ? "Draft"
            : isReady
            ? "Siap"
            : "Belum diisi";

          return (
            <div
              key={d.dateString}
              role="button"
              tabIndex={0}
              onClick={() => {
                if (onSelectDate) {
                  onSelectDate(d.dateString);
                  return;
                }
                router.push(`/reports?date=${d.dateString}`);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  if (onSelectDate) {
                    onSelectDate(d.dateString);
                  } else {
                    router.push(`/reports?date=${d.dateString}`);
                  }
                }
              }}
              title={`${d.dateString}: ${statusLabel}`}
              aria-label={`${d.dateString}: ${statusLabel}`}
              className={`h-14 sm:h-16 rounded-xs sm:rounded-sm border p-1 sm:p-1.5 flex flex-col justify-between transition-colors cursor-pointer ${
                isSubmitted
                  ? "bg-success/15 border-success/60 hover:border-success"
                  : isDraft
                  ? "bg-[#4a3b16]/60 border-warning/50 hover:border-warning"
                  : isReady
                  ? "bg-[#153b52]/60 border-info/50 hover:border-info"
                  : isFailed
                  ? "bg-[#4a1e2b]/60 border-error/50 hover:border-error"
                  : "bg-[#18231f] border-[#33443b] hover:border-[#607568]"
              }`}
            >
              <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-mono">
                <span
                  className={
                    isSubmitted
                      ? "text-success font-semibold"
                      : isFailed
                      ? "text-error font-semibold"
                      : isDraft
                      ? "text-warning font-semibold"
                      : isReady
                      ? "text-info font-semibold"
                      : "text-ink-secondary"
                  }
                >
                  {d.dayNumber}
                </span>

                {isSubmitted && (
                  <CheckCircle2 className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-success shrink-0" />
                )}
                {isDraft && (
                  <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-warning shrink-0" />
                )}
                {isReady && (
                  <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-info shrink-0" />
                )}
                {isFailed && (
                  <AlertCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-error shrink-0" />
                )}
              </div>

              {d.report ? (
                <div
                  className={`text-[9px] sm:text-[10px] font-semibold truncate ${
                    isSubmitted
                      ? "text-success"
                      : isFailed
                      ? "text-error"
                      : isDraft
                      ? "text-warning"
                      : "text-info"
                  }`}
                >
                  {statusLabel}
                </div>
              ) : (
                <div className="text-[9px] sm:text-[10px] text-ink-muted/60">Belum diisi</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
