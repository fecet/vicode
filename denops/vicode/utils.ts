import { ensure, is } from "jsr:@core/unknownutil";

// Export utility functions for type safety
export const ensureNumber = (arg: unknown): number => ensure(arg, is.Number);
export const ensureString = (arg: unknown): string => ensure(arg, is.String);
export const ensureObject = (arg: unknown): Record<string, unknown> => ensure(arg, is.Record);
