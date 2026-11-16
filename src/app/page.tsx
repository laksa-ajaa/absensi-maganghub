import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export const metadata = {
  title: "MagangHub Bot Attendance",
  description: "Masuk ke workspace absensi dan laporan MagangHub.",
};

export default async function Home() {
  const session = await auth();
  redirect(session?.user ? "/dashboard" : "/login");
}
