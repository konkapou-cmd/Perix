from pymongo import MongoClient

HASH = "$2b$12$JAYg30sNSOeM65xnCR1zc.QYysSs9GnPdAYFm5VDxGNzYf4tlKS2y"
EMAIL = "konkapou@gmail.com"

c = MongoClient("mongodb://localhost:27017")
db = c["perix"]
result = db.users.update_one({"email": EMAIL}, {"$set": {"password_hash": HASH}})
print(f"Matched: {result.matched_count}, Modified: {result.modified_count}")
c.close()
