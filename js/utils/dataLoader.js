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

export default {
  loadCSV,
  loadJSON
};
