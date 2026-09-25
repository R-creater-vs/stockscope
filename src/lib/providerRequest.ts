/** Deadlines include time spent waiting in a provider queue, not just the socket. */
export interface DataRequestOptions {
  signal?: AbortSignal;
  priority?: 'interactive' | 'background';
}

export class ProviderTimeoutError extends Error {
  constructor(message = 'The market-data provider took too long to respond.') {
    super(message);
    this.name = 'ProviderTimeoutError';
  }
}

export async function withDeadline<T>(
  task: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const abortParent = () => controller.abort(parentSignal?.reason ?? new DOMException('Cancelled', 'AbortError'));
  if (parentSignal?.aborted) abortParent();
  else parentSignal?.addEventListener('abort', abortParent, { once: true });
  const timer = setTimeout(() => controller.abort(new ProviderTimeoutError()), timeoutMs);
  let abortTask: (() => void) | undefined;
  try {
    return await new Promise<T>((resolve, reject) => {
      abortTask = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', abortTask, { once: true });
      if (controller.signal.aborted) return reject(controller.signal.reason);
      // Passing the same signal down to fetch cancels active transport, while
      // this listener also releases a caller still waiting in a provider queue.
      Promise.resolve().then(() => task(controller.signal)).then(resolve, reject);
    });
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', abortParent);
    if (abortTask) controller.signal.removeEventListener('abort', abortTask);
    // Cancel any sibling operation still running after an early return/error.
    if (!controller.signal.aborted) controller.abort(new DOMException('Request finished', 'AbortError'));
  }
}
