/**
 * For SDK calls that take no `AbortSignal`: rejects with the abort reason as soon as the
 * signal fires. The underlying request is not cancelled, but nothing waits on it any more.
 */
export function abortable<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal)
    return promise;

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort);
    });
  });
}
