export const THEME_STORAGE_KEY = "app-theme-color";

export const COLOR_THEMES = {
  blue:   { primary: "221 83% 53%", ring: "221 83% 53%", "sidebar-primary": "221 83% 53%", "sidebar-ring": "221 83% 53%" },
  green:  { primary: "142 71% 45%", ring: "142 71% 45%", "sidebar-primary": "142 71% 45%", "sidebar-ring": "142 71% 45%" },
  purple: { primary: "262 83% 58%", ring: "262 83% 58%", "sidebar-primary": "262 83% 58%", "sidebar-ring": "262 83% 58%" },
  orange: { primary: "25 95% 53%",  ring: "25 95% 53%",  "sidebar-primary": "25 95% 53%",  "sidebar-ring": "25 95% 53%"  },
  pink:   { primary: "330 81% 60%", ring: "330 81% 60%", "sidebar-primary": "330 81% 60%", "sidebar-ring": "330 81% 60%" },
  cyan:   { primary: "192 91% 36%", ring: "192 91% 36%", "sidebar-primary": "192 91% 36%", "sidebar-ring": "192 91% 36%" },
};

export const applyThemeColor = (colorValue) => {
  const theme = COLOR_THEMES[colorValue];
  if (!theme) return;
  Object.entries(theme).forEach(([key, value]) => {
    document.documentElement.style.setProperty(`--${key}`, value);
  });
  localStorage.setItem(THEME_STORAGE_KEY, colorValue);
};

export const loadSavedTheme = () => {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved && COLOR_THEMES[saved]) applyThemeColor(saved);
};
