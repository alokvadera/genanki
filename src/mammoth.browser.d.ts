declare module "mammoth/mammoth.browser" {
  interface ExtractRawTextResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }
  interface ExtractRawTextOptions {
    arrayBuffer: ArrayBuffer;
  }
  export function extractRawText(
    options: ExtractRawTextOptions,
  ): Promise<ExtractRawTextResult>;
}
