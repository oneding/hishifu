import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  // 仅 drizzle-kit generate 使用（生成 SQL 不需要真实连接）
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgresql://localhost:5432/xingyi",
  },
  verbose: true,
  strict: true,
});
