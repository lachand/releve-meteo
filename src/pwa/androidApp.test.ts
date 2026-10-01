import { afterEach, describe, expect, it } from 'vitest';
import { androidApp } from './androidApp';

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).ReleveAndroid;
});

describe('androidApp', () => {
  it('rend null dans un navigateur, sans le pont de l application', () => {
    expect(androidApp()).toBeNull();
  });

  it('rend le pont quand la page tourne dans l application Android', () => {
    const bridge = { refreshWidgets: () => undefined };
    Object.defineProperty(window, 'ReleveAndroid', { configurable: true, value: bridge });
    expect(androidApp()).toBe(bridge);
  });
});
