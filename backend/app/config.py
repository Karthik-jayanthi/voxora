import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    GNANI_API_KEY = os.getenv("GNANI_API_KEY", "")
    GNANI_STT_URL = os.getenv("GNANI_STT_URL", "https://api.vachana.ai/stt/v3")
    GNANI_TTS_URL = os.getenv("GNANI_TTS_URL", "https://api.vachana.ai/api/v1/tts/inference")
    FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
    SUPABASE_URL = os.getenv("SUPABASE_URL", "")
    SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    MAX_CONTENT_LENGTH = 10 * 1024 * 1024  # 10 MB upload cap