"""Scoped App/member navigation and single-map Home discovery release."""
import json
import island_city_scale_release as previous

operations = previous.operations
BASE = previous.ROOT
ROOT = operations.release.TEMP / "perix-home-discovery-20261110"
operations.BASE = BASE
operations.ROOT = ROOT
operations.FILES = (
    "app/(tabs)/_layout.tsx", "app/(tabs)/home.tsx", "app/(tabs)/locator.tsx", "app/_layout.tsx",
    "app/activities.tsx", "app/friend-requests.tsx",
    "components/GlobalWebChrome.tsx", "components/TopNavbar.tsx", "components/Sidebar.tsx",
    "components/city/CityGatewayScreen.tsx", "components/city/MapScreenHeader.tsx",
    "components/home/ActivitiesCarousel.tsx", "components/home/HomeDiscoveryPanel.tsx",
    "components/locator/LegacyLocatorScreen.tsx", "components/navigation/AppBottomNavigation.tsx",
    "hooks/useHomeDiscovery.ts", "lib/home/discovery.ts", "lib/navigation/bottomNavigation.ts", "lib/api/services.ts",
)
operations.ASSETS = []
operations.DEPLOYMENTS = {
    target: json.loads((BASE / target / "verification.json").read_text())["deployment"]
    for target in ("production", "staging")
}
operations.release.ROOT = ROOT
operations.release.FILES = operations.FILES
operations.release.RELEASE_MESSAGE = "Public App footer, authenticated member Home and inline single-map discovery"

if __name__ == "__main__":
    operations.main()
