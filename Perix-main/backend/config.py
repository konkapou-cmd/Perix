"""Application configuration and environment variables."""
from pathlib import Path
from dotenv import load_dotenv
import os
import cloudinary

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# MongoDB
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "perix")

# PayPal
PAYPAL_CLIENT_ID = os.getenv("PAYPAL_CLIENT_ID")
PAYPAL_CLIENT_SECRET = os.getenv("PAYPAL_CLIENT_SECRET")
PAYPAL_BASE_URL = os.getenv("PAYPAL_BASE_URL", "https://api-m.sandbox.paypal.com")

# Cloudinary
CLOUDINARY_URL = os.getenv("CLOUDINARY_URL")
if CLOUDINARY_URL:
    parts = CLOUDINARY_URL.replace('cloudinary://', '').split('@')
    if len(parts) == 2:
        cloud_name = parts[1]
        auth_parts = parts[0].split(':')
        if len(auth_parts) == 2:
            api_key = auth_parts[0]
            api_secret = auth_parts[1]
            cloudinary.config(
                cloud_name=cloud_name,
                api_key=api_key,
                api_secret=api_secret
            )

# Session settings
SESSION_DAYS = 7

# Google Maps
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", os.getenv("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY", ""))

# Category definitions
CATEGORY_CSV_URL = os.getenv(
    "CATEGORY_CSV_URL",
    "https://customer-assets.emergentagent.com/job_0b625440-96b4-4c5e-939a-00c29f93222a/artifacts/vjd9l4n4_addons_by_business_category_v6.csv",
)

# All categories now have events enabled
NIGHTLIFE_ROOTS = {
    "sports-wellness", "fashion-retail", "entertainment", "bars-nightlife",
    "professional-services", "beauty-care", "education-creativity", "restaurants"
}
