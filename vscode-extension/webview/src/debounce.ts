// Tiny debounce — avoids pulling in lodash for one function. Returns a
// function with a `.flush()` method that fires the pending call immediately
// (used on tab close / blur so pending writer content reaches the host
// without the debounce delay — preventing the "typed and closed too fast"
// data-loss case).
export interface DebouncedFn<Args extends unknown[]> {
  (...args: Args): void;
  flush(): void;
  cancel(): void;
}

export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): DebouncedFn<Parameters<T>> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  const debounced = ((...args: Parameters<T>) => {
    lastArgs = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (lastArgs) fn(...lastArgs);
    }, ms);
  }) as DebouncedFn<Parameters<T>>;
  debounced.flush = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (lastArgs) {
      const args = lastArgs;
      lastArgs = null;
      fn(...args);
    }
  };
  debounced.cancel = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    lastArgs = null;
  };
  return debounced;
}
