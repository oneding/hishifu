import { notFound } from "next/navigation";
import Link from "next/link";
import { isLocale, type Locale } from "@/i18n/messages";
import { SiteShell } from "@/components/SiteShell";
import { SessionsList } from "@/components/SessionsList";
import { loadCoursePage } from "@/lib/dto";
import { releaseExpiredHolds } from "@/lib/booking";

export const dynamic = "force-dynamic";

export default async function SessionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  void releaseExpiredHolds().catch(() => {});
  const { course, sessions } = await loadCoursePage();

  return (
    <SiteShell initialLocale={locale as Locale}>
      <div className="space-y-4 px-4 py-5">
        <div>
          <h1 className="text-[20px] font-extrabold">{course ? "场次列表" : "暂无课程"}</h1>
          <p className="mt-1 text-[12px] text-muted">所有时间均为上海当地时间（UTC+8）</p>
        </div>
        {course ? <SessionsList sessions={sessions} /> : null}
        <div className="pt-2 text-center">
          <Link href={`/${locale}`} className="text-[13px] text-accent underline">
            返回课程详情
          </Link>
        </div>
      </div>
    </SiteShell>
  );
}
