import base64
import os
import tempfile

os.environ["DM_SECRET_KEY"] = base64.urlsafe_b64encode(b"k" * 32).decode()
os.environ["DM_DATABASE_URL"] = f"sqlite+aiosqlite:///{tempfile.mkdtemp()}/test.db"
