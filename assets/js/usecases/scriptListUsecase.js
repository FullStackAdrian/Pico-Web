import { getScriptsList } from "../services/getScriptsListService.js";
import { renderScriptsList } from "../views/renderScriptsListView.js";

export async function showScriptsList() {
try {
    const files = await getScriptsList();
    renderScriptsList(files);
  } catch (error) {
    renderScripts([], error);
  }
}
