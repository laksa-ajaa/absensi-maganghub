export const DEFAULT_REPORT_CONTENT = {
  activity:
    "Melaksanakan kegiatan magang sesuai arahan mentor, menyelesaikan tugas administrasi dan operasional yang diberikan, serta melakukan pemeriksaan ulang terhadap hasil pekerjaan agar data dan dokumen yang diproses tetap lengkap, rapi, dan sesuai kebutuhan kegiatan di lokasi penempatan.",
  learning:
    "Memahami pentingnya ketelitian, keteraturan, dan komunikasi selama menjalankan kegiatan magang. Setiap tugas perlu dikerjakan berdasarkan arahan yang jelas, diperiksa kembali sebelum diserahkan, serta dicatat dengan baik agar proses pekerjaan dapat dipantau dan dilanjutkan secara terstruktur.",
  obstacles:
    "Tidak terdapat kendala teknis maupun nonteknis yang menghambat kegiatan secara signifikan. Beberapa penyesuaian kecil pada urutan pekerjaan dan pemeriksaan data dilakukan secara mandiri dengan mengikuti arahan mentor sehingga seluruh tugas harian dapat diselesaikan dengan tertib.",
} as const;

export type ReportTemplateContent = {
  activity: string;
  learning: string;
  obstacles: string;
};

export function applyDefaultReportContent(
  report: { activity: string; learning: string; obstacles: string },
  templates: Partial<ReportTemplateContent> = {}
) {
  return {
    activity: report.activity.trim() || templates.activity?.trim() || DEFAULT_REPORT_CONTENT.activity,
    learning: report.learning.trim() || templates.learning?.trim() || DEFAULT_REPORT_CONTENT.learning,
    obstacles: report.obstacles.trim() || templates.obstacles?.trim() || DEFAULT_REPORT_CONTENT.obstacles,
  };
}
