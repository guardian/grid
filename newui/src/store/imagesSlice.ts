import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { Image, ImageData } from '@/types/api';
import { fetchImageById, fetchImagesList } from '@/api/images';

interface ImagesState {
  images: Image[];
  offset: number;
  total: number;
  query: string;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
}

const initialState: ImagesState = {
  images: [],
  offset: 0,
  total: 0,
  query: '',
  loading: false,
  loadingMore: false,
  error: null,
};

export const fetchSingleImage = createAsyncThunk(
  'images/fetchSingleImage',
  async (imageId: string, { rejectWithValue }) => {
    try {
      const data = await fetchImageById(imageId);
      return data;
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : 'Failed to fetch image',
      );
    }
  },
);

export const fetchImages = createAsyncThunk(
  'images/fetchImages',
  async (
    {
      query = '',
      length = 10,
      offset = 0,
    }: { query?: string; length?: number; offset?: number } = {},
    { rejectWithValue },
  ) => {
    try {
      const data = await fetchImagesList({ query, length, offset });
      return data;
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : 'Failed to fetch images',
      );
    }
  },
);

const imagesSlice = createSlice({
  name: 'images',
  initialState,
  reducers: {
    updateImageData: (state, action: { payload: { imageId: string; data: ImageData } }) => {
      const index = state.images.findIndex(img => img.data.id === action.payload.imageId);
      if (index !== -1) {
        state.images[index].data = action.payload.data;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchImages.pending, (state, action) => {
        // Distinguish between initial load and pagination
        if (action.meta.arg?.offset === 0 || action.meta.arg === undefined) {
          state.loading = true;
          state.error = null;
        } else {
          state.loadingMore = true;
        }
        // Store the query from the request
        if (action.meta.arg?.query !== undefined) {
          state.query = action.meta.arg.query;
        }
      })
      .addCase(fetchImages.fulfilled, (state, action) => {
        state.loading = false;
        state.loadingMore = false;
        state.total = action.payload.total;
        state.offset = action.payload.offset + action.payload.length;

        // Append new images if pagination, otherwise replace
        if (action.payload.offset === 0) {
          state.images = action.payload.data;
        } else {
          state.images = [...state.images, ...action.payload.data];
        }
      })
      .addCase(fetchImages.rejected, (state, action) => {
        state.loading = false;
        state.loadingMore = false;
        state.error = action.payload as string;
      })
      .addCase(fetchSingleImage.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSingleImage.fulfilled, (state, action) => {
        state.loading = false;
        const existingIndex = state.images.findIndex(img => img.data.id === action.payload.data.id);
        if (existingIndex !== -1) {
          // Update existing image data
          state.images[existingIndex] = {
            uri: `/images/${action.payload.data.id}`,
            data: action.payload.data,
            links: action.payload.links,
            actions: action.payload.actions,
          };
        } else {
          // Replace images with the single fetched image (for detail view)
          state.images = [{
            uri: `/images/${action.payload.data.id}`,
            data: action.payload.data,
            links: action.payload.links,
            actions: action.payload.actions,
          }];
        }
      })
      .addCase(fetchSingleImage.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { updateImageData } = imagesSlice.actions;

export default imagesSlice.reducer;
