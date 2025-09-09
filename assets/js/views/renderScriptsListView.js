import { handleExecuteScript } from "../controllers/executeScriptController.js";

export function renderScriptsList(files, error = null) {
  const scriptList = document.getElementById("script-list");
  if (!scriptList) {
    throw new Error("script-list id not found in DOM.");
  }
  scriptList.innerHTML = "";
  if (error) {
    const li = document.createElement("li");
    li.textContent = `Unexpected error reading files: ${error.message}`;
    scriptList.appendChild(li);
    return;
  }

  if (files.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No se encontraron archivos.";
    scriptList.appendChild(li);
    return;
  }

  files.forEach((file) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    li.textContent = String(file);
    btn.textContent = "Ejecutar";
    btn.onclick = () => {
      handleExecuteScript(file);
    };
    li.appendChild(btn);
    scriptList.appendChild(li);
  });
}
