import { create } from "zustand";

let uploadInteractionRevision = 0;
let uploadScrollRevision = 0;
let uploadFormRevision = 0;
export const getUploadScrollRevision = () => uploadScrollRevision;
export const getUploadFormRevision = () => uploadFormRevision;
export const recordUploadScroll = () => { uploadScrollRevision = ++uploadInteractionRevision; };
export const recordUploadFormInteraction = () => { uploadFormRevision = ++uploadInteractionRevision; };

export const useUploadLayoutStore = create<{
  followingBatch: string | null;
  followBatch: (batch: string) => void;
  stopFollowingBatch: () => void;
  chrome: { intro: number; batch: number; other?: number };
  setChrome: (intro: number, batch: number) => void;
  setOther: (other: number) => void;
  navigationGeneration: number;
  beginNavigation: () => number;
  cancelNavigation: (generation: number) => void;
}>((set, get) => ({
  followingBatch: null,
  followBatch: followingBatch => set({ followingBatch }),
  stopFollowingBatch: () => { if (get().followingBatch !== null) set({ followingBatch: null }); },
  chrome: { intro: 0, batch: 0 },
  navigationGeneration: 0,
  beginNavigation: () => {
    const generation = get().navigationGeneration + 1;
    set({ navigationGeneration: generation });
    return generation;
  },
  cancelNavigation: generation => {
    if (get().navigationGeneration === generation) set({ navigationGeneration: generation + 1 });
  },
  setChrome: (intro, batch) => set(state => state.chrome.intro === intro && state.chrome.batch === batch
    ? state : { chrome: { ...state.chrome, intro, batch } }),
  setOther: other => set(state => state.chrome.other === other ? state : { chrome: { ...state.chrome, other } }),
}));