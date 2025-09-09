import api from "../utils/api.js";

export async function requestScriptsList() {
  try {
    const response = await api.get("/list-files");
    if (!response) {
      throw new Error("unexpected response from the API");
    }
    const scriptList = response;
    return scriptList;
  } catch (error) {
    throw error;
  }
}
