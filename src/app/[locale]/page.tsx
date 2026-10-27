import { notFound } from "next/navigation";
import { isLocale, type Locale } from "@/i18n/messages";
import { SiteShell } from "@/components/SiteShell";
import { CourseHome } from "@/components/CourseHome";
import { loadCoursePage } from "@/lib/dto";
import { releaseExpiredHolds } from "@/lib/booking";

export const dynamic = "force-dynamic";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  // 惰性释放超时锁位（无需常驻定时任务）
  void releaseExpiredHolds().catch(() => {});

  const { course, sessions } = await loadCoursePage();
  if (!course) {
    return (
      <SiteShell initialLocale={locale as Locale}>
        <div className="p-8 text-center text-sm text-muted">尚未配置课程，请先运行 npm run db:seed</div>
      </SiteShell>
    );
  }

  return (
    <SiteShell initialLocale={locale as Locale}>
      <CourseHome course={course} sessions={sessions} />
    </SiteShell>
  );
}
