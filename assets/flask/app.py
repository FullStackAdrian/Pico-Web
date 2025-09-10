
from flask import Flask
from flask_cors import CORS
import importlib
import os

app = Flask(__name__)

CORS(app, origins=["http://192.168.4.16:5500"])

endpoints_dir = os.path.dirname(__file__)
for filename in os.listdir(endpoints_dir):
    if  filename.endswith('.py') and filename != 'app.py':
        module_name = filename[:-3]
        module = importlib.import_module(module_name)
        if hasattr(module, 'register_endpoints'):
            module.register_endpoints(app)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=80, debug=True)
