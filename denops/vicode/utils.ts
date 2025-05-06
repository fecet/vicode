import { Denops } from "jsr:@denops/std";
import { ensure, is } from "jsr:@core/unknownutil";

// Export utility functions for type safety
export const ensureNumber = (arg: unknown): number => ensure(arg, is.Number);
export const ensureString = (arg: unknown): string => ensure(arg, is.String);
export const ensureObject = (arg: unknown): Record<string, unknown> => ensure(arg, is.Record);

// Note: These functions are kept for backward compatibility
// New code should use the DenoAdapter implementation instead

export const getCurrentLine = async (denops: Denops): Promise<number> =>
  ensureNumber(await denops.call("line", "."));

export const getLastLine = async (denops: Denops): Promise<number> =>
  ensureNumber(await denops.call("line", "$"));

export const getSpecificLineLength = async (
  denops: Denops,
  line: number,
): Promise<number> =>
  ensureNumber(
    await denops.call("strcharlen", await denops.call("getline", line)),
  );

export const getCurrentCol = async (denops: Denops): Promise<number> =>
  ensureNumber(
    await denops.call(
      "strcharlen",
      await denops.call(
        "strpart",
        await denops.call("getline", "."),
        0,
        ensureNumber(await denops.call("col", ".")) - 1,
      ),
    ),
  ) + 1;

export async function getCurrentText(denops: Denops): Promise<string> {
  return ensureString(await denops.call("getline", ".", "$"));
}
