import { z } from "zod";

export const updateAutomationPreferencesSchema = z.object({
  scheduleTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Format waktu harus HH:MM (contoh: 13:50)"),
  scheduleDays: z
    .string()
    .regex(/^[0-6](,[0-6])*$/, "Pilihan hari tidak valid")
    .refine((val) => val.trim().length > 0, "Pilih minimal satu hari"),
  latitude: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce.number().finite().min(-90, "Latitude minimal -90").max(90, "Latitude maksimal 90")
  ),
  longitude: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce.number().finite().min(-180, "Longitude minimal -180").max(180, "Longitude maksimal 180")
  ),
  defaultActivityTemplate: z.string().trim().min(100).max(500).optional(),
  defaultLearningTemplate: z.string().trim().min(100).max(500).optional(),
  defaultObstaclesTemplate: z.string().trim().min(100).max(500).optional(),
});

export type UpdateAutomationPreferencesPayload = z.infer<
  typeof updateAutomationPreferencesSchema
>;

export const toggleAutomationSchema = z.object({
  isEnabled: z.boolean(),
});

export const locationSchema = z.object({
  latitude: z.number().finite().min(-90, "Latitude minimal -90").max(90, "Latitude maksimal 90"),
  longitude: z.number().finite().min(-180, "Longitude minimal -180").max(180, "Longitude maksimal 180"),
});

export type ToggleAutomationPayload = z.infer<typeof toggleAutomationSchema>;
