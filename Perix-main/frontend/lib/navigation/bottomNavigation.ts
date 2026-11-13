export type BottomDestination = {
  id: "app" | "home" | "profile" | "messages" | "create" | "jobs";
  path?: string;
  artwork?: "home_tab" | "locator_tab" | "profile_tab" | "chat_tab" | "create_tab";
  requiresLogin: boolean;
  action?: "create" | "business";
};

export function bottomDestinations(business = false): BottomDestination[] {
  return [
    { id: "app", path: "/app", artwork: "home_tab", requiresLogin: false },
    { id: "home", path: "/(tabs)/home", artwork: "locator_tab", requiresLogin: true },
    { id: "profile", path: "/(tabs)/profile", artwork: "profile_tab", requiresLogin: true },
    { id: "messages", path: "/(tabs)/messages", artwork: "chat_tab", requiresLogin: true },
    business ? { id: "jobs", requiresLogin: true, action: "business" }
      : { id: "create", artwork: "create_tab", requiresLogin: true, action: "create" },
  ];
}

export function bottomDestinationActive(id: string, pathname: string) {
  const path = pathname.replace("/(tabs)", "");
  return id === "app" ? path === "/" || path === "/app" : path === `/${id}`;
}
