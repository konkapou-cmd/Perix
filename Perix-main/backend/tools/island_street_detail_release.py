"""One-module web-only island artwork/name/blur adjustment.

Reuse the verified isolated release flow; retain static-scene caching, icons,
backend code, settings and the public directory without modification.
"""
import scene_loading_release as operations

BASE = operations.ROOT
ROOT = operations.release.TEMP / "perix-island-street-detail-20261110"
operations.BASE = BASE
operations.ROOT = ROOT
operations.FILES = ("lib/city/landmarks.ts",)
operations.ASSETS = []
operations.DEPLOYMENTS = {
    "production": "0e027c01-e90f-4b56-abc1-417909f6b09d",
    "staging": "9cd709c8-87e4-462c-99bf-b4fbc77ccdc6",
}
operations.release.ROOT = ROOT
operations.release.FILES = operations.FILES
operations.release.RELEASE_MESSAGE = "Island detail: earlier building names, large street artwork and progressive blur"


if __name__ == "__main__":
    operations.main()
