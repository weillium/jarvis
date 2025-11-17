declare module 'pdf-parse' {
  interface PDFInfo {
    numpages?: number;
    numrender?: number;
    info?: Record<string, unknown>;
    metadata?: unknown;
    version?: string;
  }

  interface PDFData {
    text: string;
    info: PDFInfo;
    metadata: unknown;
    version: string;
  }

  type PDFParseFunction = (data: Buffer | Uint8Array, options?: Record<string, unknown>) => Promise<PDFData>;

  const pdfParse: PDFParseFunction;
  export default pdfParse;
}

