from flask import Flask, jsonify
import os

app = Flask(__name__)

def register_endpoints(app):
    @app.route('/list-files', methods=['GET'])
    def list_files():
        base_dir = os.path.join(os.path.dirname(__file__), 'scripts')
        file_list = []
        for root, dirs, files in os.walk(base_dir):
            for file in files:
                rel_dir = os.path.relpath(root, base_dir)
                rel_file = os.path.join(rel_dir, file) if rel_dir != '.' else file
                file_list.append(rel_file)
        return jsonify(file_list)

register_endpoints(app)

if __name__ == '__main__':
    app.run(debug=True)
