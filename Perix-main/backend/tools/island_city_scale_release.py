"""Calibrated island-only shrink/hold/blur edition on the live footer baseline."""
import footer_artwork_release as previous

operations = previous.operations
BASE = previous.ROOT
ROOT = operations.release.TEMP / "perix-island-city-scale-20261110"
operations.BASE = BASE
operations.ROOT = ROOT
operations.FILES = ("lib/city/landmarks.ts",)
operations.ASSETS = []
operations.DEPLOYMENTS = {
    "production": "d0c08127-dc5f-4ada-a7ec-371ac3d1f1c7",
    "staging": "6e5f2147-cf3c-4e78-9826-4eae839d4bff",
}
operations.release.ROOT = ROOT
operations.release.FILES = operations.FILES
operations.release.RELEASE_MESSAGE = "Islands: all independent buildings, calibrated town-street shrink/hold/alley blur"


if __name__ == "__main__":
    operations.main()
