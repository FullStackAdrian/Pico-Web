import api from "./api.js";

export async function showScripts() {
  const lista = document.getElementById("script-list");
  if (!lista) {
    throw new error('Elemento con id "script-list" no encontrado en el DOM.');
  }

  try {
    const response = await api.get("/list-files");
    console.log("Respuesta de la API:", response);
    const files = response;
    lista.textContent = "";

    if (files.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No se encontraron archivos.";
      lista.appendChild(li);
      return;
    }

    files.forEach((file) => {
      const li = document.createElement("li");
      li.textContent = String(file);
      lista.appendChild(li);
    });
  } catch (error) {
    console.error("Error al consultar archivos:", error);
    lista.textContent = "Error al cargar archivos.";
  }
}
