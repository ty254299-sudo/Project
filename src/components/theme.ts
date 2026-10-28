import React, { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';

export const palettes = {
  light: { mode: 'light', canvas: '#f5f7f4', paper: '#ffffff', ink: '#172b25', muted: '#64746b', line: '#dce6df', green: '#246b54', softGreen: '#e4f1e9', yellow: '#f4c95d', peach: '#fbe8d9', lavender: '#eeebfa', red: '#a8372c', focus: '#1261a0', shadow: '#173329' },
  dark: { mode: 'dark', canvas: '#121a17', paper: '#1b2721', ink: '#eef6f0', muted: '#bdc9c1', line: '#37453d', green: '#91d3b0', softGreen: '#273c31', yellow: '#f3d27c', peach: '#49362c', lavender: '#353047', red: '#ffb4a8', focus: '#8dcaff', shadow: '#000000' },
} as const;

export type AppPalette = (typeof palettes)[keyof typeof palettes];
const ThemeContext = createContext<AppPalette>(palettes.light);

export function ThemeProvider({ children }: React.PropsWithChildren) {
  const preference = useColorScheme();
  const palette = preference === 'dark' ? palettes.dark : palettes.light;
  return React.createElement(ThemeContext.Provider, { value: palette }, children);
}

export function useAppTheme() { return useContext(ThemeContext); }
