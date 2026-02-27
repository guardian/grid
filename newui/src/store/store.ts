import { configureStore } from '@reduxjs/toolkit';
import imagesReducer from './imagesSlice';
import updatesReducer from './asyncUpdates';
import { updateListenerMiddleware } from './updateListeners';

// Import mutation registrations so they run at boot
import './mutations/metadata';
import './mutations/leases';

export const store = configureStore({
  reducer: {
    images: imagesReducer,
    updates: updatesReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().prepend(updateListenerMiddleware.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
