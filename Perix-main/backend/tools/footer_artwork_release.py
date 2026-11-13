"""Three-file web-only footer styling release, retaining pending island work."""
import json

import island_street_detail_release as prior

operations = prior.operations
BASE = prior.ROOT
ROOT = operations.release.TEMP / "perix-borderless-footer-20261110"
operations.BASE = BASE
operations.ROOT = ROOT
operations.FILES = (
    "components/navigation/TabArtworkButton.tsx",
    "lib/navigation/tabLayout.ts",
    "app/(tabs)/_layout.tsx",
)
operations.ASSETS = []


def configure():
    # Never deploy a footer package built on top of the older map edition.
    # The preceding island adjustment must already be verified in both targets.
    operations.DEPLOYMENTS = {
        target: json.loads((BASE / target / "verification.json").read_text())["deployment"]
        for target in ("production", "staging")
    }
    operations.release.ROOT = ROOT
    operations.release.FILES = operations.FILES
    operations.release.RELEASE_MESSAGE = "Footer: borderless artwork, selected-icon zoom/shadow and lower separator"


if __name__ == "__main__":
    configure()
    operations.main()
