import { create } from 'zustand';
import type { Job, AppSettings, UpdateInfo } from '@crowdash/shared';

interface AppStoreState {
  currentTab: 'home' | 'queue' | 'settings' | 'dev';
  setCurrentTab: (tab: 'home' | 'queue' | 'settings' | 'dev') => void;

  pendingDownloadUrl: string | null;
  setPendingDownloadUrl: (url: string | null) => void;

  theme: 'system' | 'dark' | 'light';
  setTheme: (theme: 'system' | 'dark' | 'light') => void;

  jobs: Job[];
  setJobs: (jobs: Job[]) => void;
  updateJob: (job: Job) => void;

  settings: AppSettings | null;
  setSettings: (settings: AppSettings) => void;

  updateAvailable: UpdateInfo | null;
  setUpdateAvailable: (update: UpdateInfo | null) => void;

  isDevPanelOpen: boolean;
  setDevPanelOpen: (open: boolean) => void;
}

export const useAppStore = create<AppStoreState>((set) => ({
  currentTab: 'home',
  setCurrentTab: (tab) => set({ currentTab: tab }),

  pendingDownloadUrl: null,
  setPendingDownloadUrl: (pendingDownloadUrl) => set({ pendingDownloadUrl }),

  theme: 'dark',
  setTheme: (theme) => {
    set({ theme });
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'light') {
      root.classList.remove('dark');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) root.classList.add('dark');
      else root.classList.remove('dark');
    }
  },

  jobs: [],
  setJobs: (jobs) => set({ jobs }),
  updateJob: (updatedJob) =>
    set((state) => {
      const idx = state.jobs.findIndex((j) => j.id === updatedJob.id);
      if (idx === -1) return { jobs: [updatedJob, ...state.jobs] };
      const next = [...state.jobs];
      next[idx] = updatedJob;
      return { jobs: next };
    }),

  settings: null,
  setSettings: (settings) => set({ settings }),

  updateAvailable: null,
  setUpdateAvailable: (updateAvailable) => set({ updateAvailable }),

  isDevPanelOpen: false,
  setDevPanelOpen: (isDevPanelOpen) => set({ isDevPanelOpen }),
}));
