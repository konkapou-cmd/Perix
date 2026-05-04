import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from config import MONGO_URL, DB_NAME
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

async def delete():
    artist = await db.artists.find_one({"name": "Konstantinos"})
    if artist:
        print(f"Found: {artist.get(\"name\")}")
        aid = artist.get("artist_id")
        await db.artists.delete_one({"artist_id": aid})
        await db.posts.delete_many({"actor_type": "artist", "actor_id": aid})
        print("Deleted!")

asyncio.run(delete())
