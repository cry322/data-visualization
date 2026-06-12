export async function loadCSV(path) {
  try {
    return await d3.csv(path);
  } catch (error) {
    console.error(`Failed to load CSV: ${path}`, error);
    return [];
  }
}

export async function loadJSON(path) {
  try {
    return await d3.json(path);
  } catch (error) {
    console.error(`Failed to load JSON: ${path}`, error);
    return null;
  }
}

export const FIELD_PALETTE = {
  light: {
    Physics: "#426B8F",
    Chemistry: "#4D8B68",
    Medicine: "#B8646A"
  },
  dark: {
    Physics: "#8FB7D8",
    Chemistry: "#9FCFAC",
    Medicine: "#E0A2AA"
  }
};

export const FIELD_RAMP_START = {
  light: {
    Physics: "#EAF2F8",
    Chemistry: "#E8F4ED",
    Medicine: "#F8ECEB"
  },
  dark: {
    Physics: "#26384A",
    Chemistry: "#284635",
    Medicine: "#513A3E"
  }
};

export function getThemeMode() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function getFieldColor(field, mode = getThemeMode()) {
  return FIELD_PALETTE[mode]?.[field] || (mode === "dark" ? "#D1C9DC" : "#8A96A6");
}

export function getFieldRamp(field, mode = getThemeMode()) {
  return [
    FIELD_RAMP_START[mode]?.[field] || (mode === "dark" ? "#4B5668" : "#EDF1F5"),
    getFieldColor(field, mode)
  ];
}

export default {
  loadCSV,
  loadJSON,
  FIELD_PALETTE,
  FIELD_RAMP_START,
  getThemeMode,
  getFieldColor,
  getFieldRamp
};
