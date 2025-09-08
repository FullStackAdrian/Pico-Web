import api from "../utils/api.js";

export async function getScriptText(filename) {
  try {
    const response = await api.post("/text-data-file", {
      filename    });
    if (!response) {
      throw new Error("unexpected response from the API");
    }
    const scriptDataText = response;
    return scriptDataText;
  } catch (error) {
    throw error;
  }
}
