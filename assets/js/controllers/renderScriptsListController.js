import { getScriptList } from "../usecases/getScriptListUsecase.js";
import { renderScriptsList as renderView } from "../views/renderScriptsListView.js";

export async function renderScriptsList() {
  try {
    const files = await getScriptList();
    renderView(files);
  } catch (error) {
    renderView([], error);
  }
}   