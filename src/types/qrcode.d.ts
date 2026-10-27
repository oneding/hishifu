declare module "qrcode" {
  export interface QrOptions {
    type?: "svg" | "terminal" | "utf8";
    margin?: number;
    width?: number;
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
    color?: { dark?: string; light?: string };
  }
  export function toString(text: string, options?: QrOptions): Promise<string>;
  export function toDataURL(text: string, options?: QrOptions): Promise<string>;
  const qrcode: {
    toString(text: string, options?: QrOptions): Promise<string>;
    toDataURL(text: string, options?: QrOptions): Promise<string>;
  };
  export default qrcode;
}
