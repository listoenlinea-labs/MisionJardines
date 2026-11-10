/* Fetch con timeout compatible con Safari/iOS 15 (iPhone 7).
 * No usa AbortSignal.timeout ni APIs modernas no disponibles en Safari antiguo. */
(function (root) {
  'use strict';

  async function fetchWithTimeout(url, options, milliseconds) {
    const timeoutMs = Number(milliseconds);
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new TypeError('El tiempo de espera debe ser un número positivo.');
    }
    const controller = new AbortController();
    const requestOptions = Object.assign({}, options || {}, { signal: controller.signal });
    let timedOut = false;
    const timer = setTimeout(function () {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      return await fetch(url, requestOptions);
    } catch (cause) {
      // AbortController.abort() produce AbortError en Safari 15.
      // Estandarizar el error mantiene el mensaje existente del login.
      if (timedOut) {
        const err = new Error('El servidor tardó en responder. Intenta nuevamente.');
        err.name = 'TimeoutError';
        throw err;
      }
      throw cause;
    } finally {
      clearTimeout(timer);
    }
  }

  root.MJFetchWithTimeout = fetchWithTimeout;
})(typeof window !== 'undefined' ? window : this);
