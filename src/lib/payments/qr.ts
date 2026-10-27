/** 二维码（服务端生成 SVG，避免前端再引依赖） */
export async function qrSvg(text: string, width = 240): Promise<string> {
  const mod = (await import("qrcode")) as unknown as {
    toString: (t: string, o?: Record<string, unknown>) => Promise<string>;
  };
  return mod.toString(text, {
    type: "svg",
    width,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#111827", light: "#ffffff" },
  });
}
