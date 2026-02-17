export type AdminCallApi = <T>(path: string, init?: RequestInit) => Promise<T>;
export type AdminCallApiRaw = (path: string, init?: RequestInit) => Promise<Response>;

export function parseLineSeparatedValues(input: string): string[] {
  return input
    .split(/\r?\n|,/g)
    .map((item) => item.trim())
    .filter(Boolean);
}
