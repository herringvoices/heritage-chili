import { AsyncLocalStorage } from "node:async_hooks";

export type RuntimeEnv = Cloudflare.Env & {
  ASSETS?: Fetcher;
  IMAGES?: unknown;
};

const storageKey = Symbol.for("chili-cookoff.runtime-env");
const globals = globalThis as typeof globalThis & { [storageKey]?: AsyncLocalStorage<RuntimeEnv> };
const runtimeEnvStorage = (globals[storageKey] ??= new AsyncLocalStorage<RuntimeEnv>());

export function runWithRuntimeEnv<T>(environment: RuntimeEnv, callback: () => T): T {
  return runtimeEnvStorage.run(environment, callback);
}

export function getRuntimeEnv(): RuntimeEnv {
  const environment = runtimeEnvStorage.getStore();
  if (!environment) throw new Error("Runtime environment is unavailable outside a request.");
  return environment;
}
