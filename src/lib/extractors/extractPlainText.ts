export async function extractPlainText(file: File): Promise<string> {
  return file.text();
}
