import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { CustomTheme } from '@common/types';

interface CustomThemeState {
    themes: CustomTheme[];
    isLoading: boolean;
}

const initialState: CustomThemeState = {
    themes: [],
    isLoading: false,
};

const customThemeSlice = createSlice({
    name: 'customThemes',
    initialState,
    reducers: {
        setThemes: (state, action: PayloadAction<CustomTheme[]>) => {
            state.themes = action.payload;
            state.isLoading = false;
        },
        addTheme: (state, action: PayloadAction<CustomTheme>) => {
            state.themes.unshift(action.payload); // Add to top
        },
        updateTheme: (state, action: PayloadAction<CustomTheme>) => {
            const index = state.themes.findIndex(t => t.id === action.payload.id);
            if (index !== -1) {
                state.themes[index] = action.payload;
            }
        },
        removeTheme: (state, action: PayloadAction<string>) => {
            state.themes = state.themes.filter(t => t.id !== action.payload);
        },
    },
});

export const { setThemes, addTheme, updateTheme, removeTheme } = customThemeSlice.actions;
export default customThemeSlice.reducer;
