import { redirect } from "next/navigation";
import { currentAdmin, type AdminUser } from "@/lib/auth";

/** 后台受保护页面统一入口：未登录直接跳登录页 */
export async function ensureAdmin(): Promise<AdminUser> {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

/** 登录页等公开页：已登录则直接进入后台 */
export async function redirectIfLoggedIn(): Promise<void> {
  const admin = await currentAdmin();
  if (admin) redirect("/admin");
}
