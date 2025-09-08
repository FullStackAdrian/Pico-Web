from flask import Flask, jsonify, request
import os

app = Flask(__name__)

def register_endpoints(app):
    @app.route('/text-data-file', methods=['POST'])
    def text_data_file():
        data = request.get_json()
        if not data or "filename" not in data:
            return jsonify({"error": "Falta el parámetro 'filename'"}), 400

        filename = data["filename"]

        base_dir = os.path.join(os.path.dirname(__file__), 'scripts')
        file_path = os.path.join(base_dir, filename)

        if not os.path.abspath(file_path).startswith(os.path.abspath(base_dir)):
            return jsonify({"error": "Acceso denegado"}), 403

        if not os.path.isfile(file_path):
            return jsonify({"error": "Archivo no encontrado"}), 404

        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        return jsonify({"filename": filename, "content": content})

register_endpoints(app)

if __name__ == '__main__':
    app.run(debug=True)
