"""Print the OpenAPI schema: `uv run python -m tobox.openapi > ../frontend/openapi.json`."""

import json

from tobox.main import app

if __name__ == "__main__":
    print(json.dumps(app.openapi(), indent=2))
