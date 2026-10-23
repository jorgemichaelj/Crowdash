import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { connectExtension, type ExtensionAction } from '../src/services/extension/connectExtension';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

let signal: () => void;
let unlisten: ReturnType<typeof vi.fn>;
let disconnect: (() => void) | undefined;
beforeEach(() => {
  vi.resetAllMocks();
  unlisten = vi.fn();
  vi.mocked(listen).mockImplementation(async (_name, handler) => {
    signal = () => handler({} as never);
    return unlisten;
  });
  vi.mocked(invoke).mockResolvedValue(null);
});
afterEach(() => { disconnect?.(); disconnect = undefined; });

describe('native extension delivery', () => {
  it('drains every action received while the interface was closed, in order', async () => {
    const first = { type: 'analyze', url: 'https://example.com/first' };
    const second = { type: 'queue' };
    vi.mocked(invoke).mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const received: ExtensionAction[] = [];
    disconnect = connectExtension(action => received.push(action), vi.fn());
    await vi.waitFor(() => expect(received).toEqual([first, second]));
    expect(listen).toHaveBeenCalledWith('extension:action', expect.any(Function));
  });

  it('retains an action already taken from the backend if React cleans up the effect', async () => {
    let reply!: (action: unknown) => void;
    vi.mocked(invoke).mockImplementationOnce(() => new Promise(resolve => { reply = resolve; }));
    const received = vi.fn();
    disconnect = connectExtension(received, vi.fn());
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledOnce());
    disconnect(); disconnect = undefined;
    const action = { type: 'analyze', url: 'https://example.com/retained' };
    reply(action);
    await vi.waitFor(() => expect(received).toHaveBeenCalledExactlyOnceWith(action));
    expect(unlisten).toHaveBeenCalledOnce();
  });

  it('serializes event bursts and continues after an event arrives during the last read', async () => {
    let finishRead!: (action: unknown) => void;
    vi.mocked(invoke).mockImplementationOnce(() => new Promise(resolve => { finishRead = resolve; }));
    const received = vi.fn();
    disconnect = connectExtension(received, vi.fn());
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledOnce());
    signal(); signal(); signal();
    expect(invoke).toHaveBeenCalledOnce();
    vi.mocked(invoke).mockResolvedValueOnce({ type: 'queue' });
    finishRead(null);
    await vi.waitFor(() => expect(received).toHaveBeenCalledExactlyOnceWith({ type: 'queue' }));
  });

  it('removes a listener whose registration completes after cleanup', async () => {
    let registered!: (fn: () => void) => void;
    vi.mocked(listen).mockImplementationOnce(() => new Promise(resolve => { registered = resolve; }));
    disconnect = connectExtension(vi.fn(), vi.fn());
    disconnect(); disconnect = undefined;
    registered(unlisten);
    await vi.waitFor(() => expect(unlisten).toHaveBeenCalledOnce());
    expect(invoke).not.toHaveBeenCalled();
  });
});
