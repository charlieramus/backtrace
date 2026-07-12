// Scoped ambient type for the one Node builtin a test uses (PDF content-stream inflation
// in exportPdf.test.ts). Declared locally so the browser app doesn't pull in @types/node
// globally (which would expose Node globals like Buffer/process app-wide).

declare module "node:zlib" {
  export function inflateSync(data: Uint8Array): Uint8Array;
}
