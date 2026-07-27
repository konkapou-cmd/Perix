export type MarketplaceAttributeType =
  | "text"
  | "number"
  | "boolean"
  | "single_select"
  | "multi_select";

export type MarketplaceAttributeOption = {
  key: string;
  labelKey: string;
  fallback: string;
};

export type MarketplaceAttribute = {
  key: string;
  labelKey: string;
  fallback: string;
  type: MarketplaceAttributeType;
  required?: boolean;
  filterable?: boolean;
  options?: MarketplaceAttributeOption[];
};

export type MarketplaceSubcategory = {
  key: string;
  labelKey: string;
  fallback: string;
  attributes?: MarketplaceAttribute[];
};

export type MarketplaceCategory = {
  key: string;
  legacyKeys?: string[];
  labelKey: string;
  fallback: string;
  icon: string;
  subcategories: MarketplaceSubcategory[];
  attributes?: MarketplaceAttribute[];
};

export const CATEGORY_ALIASES: Record<string, string[]> = {
  home_garden_diy: ["home_garden_diy", "home_garden"],
  sports_outdoor: ["sports_outdoor", "sports"],
  media_music: ["media_music", "books"],
};

export const LEGACY_TO_CANONICAL: Record<string, string> = {
  home_garden: "home_garden_diy",
  sports: "sports_outdoor",
  books: "media_music",
};

const CONDITION_OPTIONS: MarketplaceAttributeOption[] = [
  { key: "new", labelKey: "listing.condition.new", fallback: "Neu" },
  { key: "like_new", labelKey: "listing.condition.like_new", fallback: "Wie neu" },
  { key: "good", labelKey: "listing.condition.good", fallback: "Gut" },
  { key: "used", labelKey: "listing.condition.used", fallback: "Gebraucht" },
];

const BRAND_ATTR: MarketplaceAttribute = {
  key: "brand", labelKey: "listing.brand", fallback: "Marke", type: "text", filterable: true,
};

const MODEL_ATTR: MarketplaceAttribute = {
  key: "model", labelKey: "listing.model", fallback: "Modell", type: "text", filterable: true,
};

const SIZE_ATTR: MarketplaceAttribute = {
  key: "size", labelKey: "listing.size", fallback: "Größe", type: "text", filterable: true,
};

const COLOR_ATTR: MarketplaceAttribute = {
  key: "color", labelKey: "listing.color", fallback: "Farbe", type: "text", filterable: true,
};

const MATERIAL_ATTR: MarketplaceAttribute = {
  key: "material", labelKey: "listing.material", fallback: "Material", type: "text",
};

const TARGET_GROUP_OPTIONS: MarketplaceAttributeOption[] = [
  { key: "adults", labelKey: "listing.targetGroup.adults", fallback: "Erwachsene" },
  { key: "kids", labelKey: "listing.targetGroup.kids", fallback: "Kinder" },
  { key: "unisex", labelKey: "listing.targetGroup.unisex", fallback: "Unisex" },
];

const CONDITION_GRADE_OPTIONS: MarketplaceAttributeOption[] = [
  { key: "mint", labelKey: "listing.conditionGrade.mint", fallback: "Neuwertig" },
  { key: "very_good", labelKey: "listing.conditionGrade.very_good", fallback: "Sehr gut" },
  { key: "good", labelKey: "listing.conditionGrade.good", fallback: "Gut" },
  { key: "acceptable", labelKey: "listing.conditionGrade.acceptable", fallback: "Akzeptabel" },
];

export const MARKETPLACE_CATEGORIES: MarketplaceCategory[] = [
  {
    key: "electronics",
    labelKey: "marketplace.cat.electronics",
    fallback: "Elektronik",
    icon: "phone-portrait-outline",
    subcategories: [
      { key: "smartphones", labelKey: "marketplace.sub.smartphones", fallback: "Smartphones & Handys", attributes: [BRAND_ATTR, MODEL_ATTR, { key: "storage_gb", labelKey: "listing.storageGb", fallback: "Speicher", type: "text", filterable: true }, { key: "screen_size", labelKey: "listing.screenSize", fallback: "Bildschirmgröße", type: "text" }, COLOR_ATTR, { key: "warranty", labelKey: "listing.warranty", fallback: "Garantie", type: "boolean" }, { key: "original_packaging", labelKey: "listing.originalPackaging", fallback: "Originalverpackung", type: "boolean" }] },
      { key: "computers_tablets", labelKey: "marketplace.sub.computersTablets", fallback: "Computer & Tablets", attributes: [BRAND_ATTR, MODEL_ATTR, { key: "storage_gb", labelKey: "listing.storageGb", fallback: "Speicher", type: "text", filterable: true }, { key: "screen_size", labelKey: "listing.screenSize", fallback: "Bildschirmgröße", type: "text" }, { key: "processor", labelKey: "listing.processor", fallback: "Prozessor", type: "text" }, { key: "ram_gb", labelKey: "listing.ramGb", fallback: "RAM", type: "text" }] },
      { key: "tv_video", labelKey: "marketplace.sub.tvVideo", fallback: "Fernseher & Video", attributes: [BRAND_ATTR, MODEL_ATTR, { key: "screen_size", labelKey: "listing.screenSize", fallback: "Bildschirmgröße", type: "text", filterable: true }] },
      { key: "audio_hifi", labelKey: "marketplace.sub.audioHifi", fallback: "Audio & Hi-Fi", attributes: [BRAND_ATTR, MODEL_ATTR] },
      { key: "gaming_hardware", labelKey: "marketplace.sub.gamingHardware", fallback: "Konsolen & Gaming-Hardware", attributes: [BRAND_ATTR, MODEL_ATTR] },
      { key: "cameras", labelKey: "marketplace.sub.cameras", fallback: "Kameras & Foto", attributes: [BRAND_ATTR, MODEL_ATTR] },
      { key: "wearables", labelKey: "marketplace.sub.wearables", fallback: "Smartwatches & Wearables", attributes: [BRAND_ATTR, MODEL_ATTR, SIZE_ATTR] },
      { key: "smart_home", labelKey: "marketplace.sub.smartHome", fallback: "Smart Home", attributes: [BRAND_ATTR, MODEL_ATTR] },
      { key: "networking", labelKey: "marketplace.sub.networking", fallback: "Router & Netzwerk", attributes: [BRAND_ATTR, MODEL_ATTR] },
      { key: "electronic_accessories", labelKey: "marketplace.sub.electronicAccessories", fallback: "Zubehör & Ersatzteile", attributes: [BRAND_ATTR] },
    ],
  },
  {
    key: "home_garden_diy",
    legacyKeys: ["home_garden"],
    labelKey: "marketplace.cat.homeGardenDiy",
    fallback: "Haus, Garten & Heimwerken",
    icon: "home-outline",
    subcategories: [
      { key: "furniture", labelKey: "marketplace.sub.furniture", fallback: "Möbel", attributes: [BRAND_ATTR, MATERIAL_ATTR, COLOR_ATTR, { key: "width_cm", labelKey: "listing.widthCm", fallback: "Breite (cm)", type: "number" }, { key: "height_cm", labelKey: "listing.heightCm", fallback: "Höhe (cm)", type: "number" }, { key: "depth_cm", labelKey: "listing.depthCm", fallback: "Tiefe (cm)", type: "number" }, { key: "assembled", labelKey: "listing.assembled", fallback: "Aufgebaut", type: "boolean" }] },
      { key: "kitchen_household", labelKey: "marketplace.sub.kitchenHousehold", fallback: "Küche & Haushalt", attributes: [BRAND_ATTR] },
      { key: "large_appliances", labelKey: "marketplace.sub.largeAppliances", fallback: "Haushaltsgroßgeräte", attributes: [BRAND_ATTR, MODEL_ATTR] },
      { key: "small_appliances", labelKey: "marketplace.sub.smallAppliances", fallback: "Haushaltskleingeräte", attributes: [BRAND_ATTR, MODEL_ATTR] },
      { key: "decoration", labelKey: "marketplace.sub.decoration", fallback: "Dekoration & Wohnaccessoires", attributes: [MATERIAL_ATTR, COLOR_ATTR] },
      { key: "lighting", labelKey: "marketplace.sub.lighting", fallback: "Lampen & Beleuchtung", attributes: [BRAND_ATTR] },
      { key: "garden", labelKey: "marketplace.sub.garden", fallback: "Garten & Terrasse", attributes: [BRAND_ATTR, MATERIAL_ATTR] },
      { key: "tools", labelKey: "marketplace.sub.tools", fallback: "Werkzeuge", attributes: [BRAND_ATTR, MODEL_ATTR] },
      { key: "renovation_materials", labelKey: "marketplace.sub.renovationMaterials", fallback: "Renovieren & Baustoffe", attributes: [BRAND_ATTR] },
      { key: "storage", labelKey: "marketplace.sub.storage", fallback: "Aufbewahrung & Organisation", attributes: [BRAND_ATTR, MATERIAL_ATTR] },
    ],
  },
  {
    key: "fashion",
    labelKey: "marketplace.cat.fashion",
    fallback: "Mode & Accessoires",
    icon: "shirt-outline",
    subcategories: [
      { key: "womens_clothing", labelKey: "marketplace.sub.womensClothing", fallback: "Damenbekleidung", attributes: [BRAND_ATTR, SIZE_ATTR, COLOR_ATTR, MATERIAL_ATTR, { key: "target_group", labelKey: "listing.targetGroup", fallback: "Zielgruppe", type: "single_select", options: TARGET_GROUP_OPTIONS }] },
      { key: "mens_clothing", labelKey: "marketplace.sub.mensClothing", fallback: "Herrenbekleidung", attributes: [BRAND_ATTR, SIZE_ATTR, COLOR_ATTR, MATERIAL_ATTR] },
      { key: "kids_clothing", labelKey: "marketplace.sub.kidsClothing", fallback: "Kinderbekleidung", attributes: [BRAND_ATTR, SIZE_ATTR, COLOR_ATTR, { key: "age_group", labelKey: "listing.ageGroup", fallback: "Altersgruppe", type: "text" }] },
      { key: "shoes", labelKey: "marketplace.sub.shoes", fallback: "Schuhe", attributes: [BRAND_ATTR, SIZE_ATTR, COLOR_ATTR] },
      { key: "bags", labelKey: "marketplace.sub.bags", fallback: "Taschen & Rucksäcke", attributes: [BRAND_ATTR, SIZE_ATTR, COLOR_ATTR, MATERIAL_ATTR] },
      { key: "jewelry", labelKey: "marketplace.sub.jewelry", fallback: "Schmuck", attributes: [BRAND_ATTR, MATERIAL_ATTR] },
      { key: "watches", labelKey: "marketplace.sub.watches", fallback: "Uhren", attributes: [BRAND_ATTR, MODEL_ATTR] },
      { key: "sportswear", labelKey: "marketplace.sub.sportswear", fallback: "Sportbekleidung", attributes: [BRAND_ATTR, SIZE_ATTR] },
      { key: "workwear", labelKey: "marketplace.sub.workwear", fallback: "Arbeitskleidung", attributes: [BRAND_ATTR, SIZE_ATTR] },
      { key: "vintage_designer", labelKey: "marketplace.sub.vintageDesigner", fallback: "Vintage & Designer", attributes: [BRAND_ATTR, SIZE_ATTR, { key: "authenticity_proof", labelKey: "listing.authenticityProof", fallback: "Echtheitsnachweis", type: "boolean" }] },
      { key: "fashion_accessories", labelKey: "marketplace.sub.fashionAccessories", fallback: "Accessoires", attributes: [BRAND_ATTR] },
    ],
  },
  {
    key: "baby_kids",
    labelKey: "marketplace.cat.babyKids",
    fallback: "Baby & Kind",
    icon: "happy-outline",
    subcategories: [
      { key: "baby_equipment", labelKey: "marketplace.sub.babyEquipment", fallback: "Babyausstattung", attributes: [BRAND_ATTR, MODEL_ATTR, { key: "age_group", labelKey: "listing.ageGroup", fallback: "Altersgruppe", type: "text" }, { key: "safety_standard", labelKey: "listing.safetyStandard", fallback: "Sicherheitsnorm", type: "text" }] },
      { key: "strollers", labelKey: "marketplace.sub.strollers", fallback: "Kinderwagen", attributes: [BRAND_ATTR, MODEL_ATTR, { key: "accident_free", labelKey: "listing.accidentFree", fallback: "Unfallfrei", type: "boolean" }] },
      { key: "car_seats", labelKey: "marketplace.sub.carSeats", fallback: "Autositze", attributes: [BRAND_ATTR, MODEL_ATTR, { key: "manufacture_date", labelKey: "listing.manufactureDate", fallback: "Herstellungsdatum", type: "text" }, { key: "accident_free", labelKey: "listing.accidentFree", fallback: "Unfallfrei", type: "boolean" }, { key: "safety_standard", labelKey: "listing.safetyStandard", fallback: "Sicherheitsnorm", type: "text" }] },
      { key: "nursery_furniture", labelKey: "marketplace.sub.nurseryFurniture", fallback: "Kinderzimmer", attributes: [BRAND_ATTR, MODEL_ATTR, MATERIAL_ATTR] },
      { key: "baby_clothing", labelKey: "marketplace.sub.babyClothing", fallback: "Babykleidung", attributes: [BRAND_ATTR, SIZE_ATTR] },
      { key: "toys_learning", labelKey: "marketplace.sub.toysLearning", fallback: "Spielzeug & Lernen", attributes: [BRAND_ATTR, { key: "age_group", labelKey: "listing.ageGroup", fallback: "Altersgruppe", type: "text" }] },
      { key: "school_supplies", labelKey: "marketplace.sub.schoolSupplies", fallback: "Schule & Lernen", attributes: [BRAND_ATTR] },
      { key: "feeding", labelKey: "marketplace.sub.feeding", fallback: "Essen & Stillen", attributes: [BRAND_ATTR] },
      { key: "baby_safety_care", labelKey: "marketplace.sub.babySafetyCare", fallback: "Sicherheit & Pflege", attributes: [BRAND_ATTR] },
    ],
  },
  {
    key: "sports_outdoor",
    legacyKeys: ["sports"],
    labelKey: "marketplace.cat.sportsOutdoor",
    fallback: "Sport & Outdoor",
    icon: "fitness-outline",
    subcategories: [
      { key: "fitness", labelKey: "marketplace.sub.fitness", fallback: "Fitness & Training", attributes: [BRAND_ATTR, { key: "sport_type", labelKey: "listing.sportType", fallback: "Sportart", type: "text" }, SIZE_ATTR, { key: "weight_kg", labelKey: "listing.weightKg", fallback: "Gewicht (kg)", type: "number" }] },
      { key: "running", labelKey: "marketplace.sub.running", fallback: "Laufen", attributes: [BRAND_ATTR, SIZE_ATTR] },
      { key: "team_sports", labelKey: "marketplace.sub.teamSports", fallback: "Fußball & Teamsport", attributes: [BRAND_ATTR, SIZE_ATTR] },
      { key: "camping_hiking", labelKey: "marketplace.sub.campingHiking", fallback: "Camping & Wandern", attributes: [BRAND_ATTR] },
      { key: "winter_sports", labelKey: "marketplace.sub.winterSports", fallback: "Wintersport", attributes: [BRAND_ATTR, SIZE_ATTR] },
      { key: "water_sports", labelKey: "marketplace.sub.waterSports", fallback: "Wassersport", attributes: [BRAND_ATTR] },
      { key: "racket_sports", labelKey: "marketplace.sub.racketSports", fallback: "Tennis & Rückschlagsport", attributes: [BRAND_ATTR] },
      { key: "climbing", labelKey: "marketplace.sub.climbing", fallback: "Klettern", attributes: [BRAND_ATTR] },
      { key: "golf", labelKey: "marketplace.sub.golf", fallback: "Golf", attributes: [BRAND_ATTR] },
      { key: "sports_accessories", labelKey: "marketplace.sub.sportsAccessories", fallback: "Sportzubehör", attributes: [BRAND_ATTR] },
      { key: "outdoor_clothing", labelKey: "marketplace.sub.outdoorClothing", fallback: "Outdoor-Bekleidung", attributes: [BRAND_ATTR, SIZE_ATTR] },
    ],
  },
  {
    key: "bikes_mobility",
    labelKey: "marketplace.cat.bikesMobility",
    fallback: "Fahrräder & Mobilität",
    icon: "bicycle-outline",
    subcategories: [
      { key: "bicycles", labelKey: "marketplace.sub.bicycles", fallback: "Fahrräder", attributes: [BRAND_ATTR, MODEL_ATTR, { key: "bike_type", labelKey: "listing.bikeType", fallback: "Fahrradtyp", type: "text", filterable: true }, { key: "frame_size", labelKey: "listing.frameSize", fallback: "Rahmengröße", type: "text", filterable: true }, { key: "wheel_size", labelKey: "listing.wheelSize", fallback: "Radgröße", type: "text", filterable: true }, { key: "model_year", labelKey: "listing.modelYear", fallback: "Baujahr", type: "number", filterable: true }] },
      { key: "electric_bikes", labelKey: "marketplace.sub.electricBikes", fallback: "E-Bikes", attributes: [BRAND_ATTR, MODEL_ATTR, { key: "frame_size", labelKey: "listing.frameSize", fallback: "Rahmengröße", type: "text", filterable: true }, { key: "mileage_km", labelKey: "listing.mileageKm", fallback: "Kilometerstand", type: "number" }, { key: "battery_capacity", labelKey: "listing.batteryCapacity", fallback: "Akkukapazität", type: "text" }, { key: "battery_condition", labelKey: "listing.batteryCondition", fallback: "Akkuzustand", type: "text" }] },
      { key: "scooters", labelKey: "marketplace.sub.scooters", fallback: "Roller & Scooter", attributes: [BRAND_ATTR] },
      { key: "electric_scooters", labelKey: "marketplace.sub.electricScooters", fallback: "E-Scooter", attributes: [BRAND_ATTR, MODEL_ATTR] },
      { key: "bike_parts", labelKey: "marketplace.sub.bikeParts", fallback: "Fahrradteile", attributes: [BRAND_ATTR] },
      { key: "bike_accessories", labelKey: "marketplace.sub.bikeAccessories", fallback: "Fahrradzubehör", attributes: [BRAND_ATTR] },
      { key: "helmets_protection", labelKey: "marketplace.sub.helmetsProtection", fallback: "Helme & Schutz", attributes: [BRAND_ATTR, SIZE_ATTR] },
      { key: "child_transport", labelKey: "marketplace.sub.childTransport", fallback: "Kindertransport", attributes: [BRAND_ATTR] },
      { key: "mobility_aids", labelKey: "marketplace.sub.mobilityAids", fallback: "Mobilitätshilfen", attributes: [BRAND_ATTR] },
    ],
  },
  {
    key: "media_music",
    legacyKeys: ["books"],
    labelKey: "marketplace.cat.mediaMusic",
    fallback: "Bücher, Medien & Musik",
    icon: "book-outline",
    subcategories: [
      { key: "books", labelKey: "marketplace.sub.books", fallback: "Bücher", attributes: [{ key: "genre", labelKey: "listing.genre", fallback: "Genre", type: "text", filterable: true }, { key: "language", labelKey: "listing.language", fallback: "Sprache", type: "text", filterable: true }, { key: "author_artist", labelKey: "listing.authorArtist", fallback: "Autor", type: "text" }, { key: "publisher_label", labelKey: "listing.publisherLabel", fallback: "Verlag", type: "text" }, { key: "isbn", labelKey: "listing.isbn", fallback: "ISBN", type: "text" }, { key: "release_year", labelKey: "listing.releaseYear", fallback: "Erscheinungsjahr", type: "number" }] },
      { key: "comics_manga", labelKey: "marketplace.sub.comicsManga", fallback: "Comics & Manga", attributes: [{ key: "genre", labelKey: "listing.genre", fallback: "Genre", type: "text" }, { key: "language", labelKey: "listing.language", fallback: "Sprache", type: "text" }] },
      { key: "movies_series", labelKey: "marketplace.sub.moviesSeries", fallback: "Filme & Serien", attributes: [{ key: "format", labelKey: "listing.format", fallback: "Format", type: "text", filterable: true }, { key: "genre", labelKey: "listing.genre", fallback: "Genre", type: "text" }, { key: "language", labelKey: "listing.language", fallback: "Sprache", type: "text" }] },
      { key: "cds", labelKey: "marketplace.sub.cds", fallback: "CDs", attributes: [{ key: "genre", labelKey: "listing.genre", fallback: "Genre", type: "text" }] },
      { key: "vinyl", labelKey: "marketplace.sub.vinyl", fallback: "Vinyl", attributes: [{ key: "genre", labelKey: "listing.genre", fallback: "Genre", type: "text" }, { key: "release_year", labelKey: "listing.releaseYear", fallback: "Erscheinungsjahr", type: "number" }] },
      { key: "musical_instruments", labelKey: "marketplace.sub.musicalInstruments", fallback: "Musikinstrumente", attributes: [BRAND_ATTR, MODEL_ATTR] },
      { key: "studio_dj", labelKey: "marketplace.sub.studioDj", fallback: "Studio- & DJ-Equipment", attributes: [BRAND_ATTR, MODEL_ATTR] },
      { key: "sheet_music", labelKey: "marketplace.sub.sheetMusic", fallback: "Noten", attributes: [] },
      { key: "media_accessories", labelKey: "marketplace.sub.mediaAccessories", fallback: "Medienzubehör", attributes: [BRAND_ATTR] },
    ],
  },
  {
    key: "toys_games",
    labelKey: "marketplace.cat.toysGames",
    fallback: "Spielzeug & Games",
    icon: "game-controller-outline",
    subcategories: [
      { key: "console_games", labelKey: "marketplace.sub.consoleGames", fallback: "Videospiele", attributes: [{ key: "platform", labelKey: "listing.platform", fallback: "Plattform", type: "text", filterable: true }, { key: "language", labelKey: "listing.language", fallback: "Sprache", type: "text" }, { key: "complete", labelKey: "listing.complete", fallback: "Vollständig", type: "boolean" }] },
      { key: "board_games", labelKey: "marketplace.sub.boardGames", fallback: "Brettspiele", attributes: [{ key: "players", labelKey: "listing.players", fallback: "Spieleranzahl", type: "text" }, { key: "language", labelKey: "listing.language", fallback: "Sprache", type: "text" }, { key: "complete", labelKey: "listing.complete", fallback: "Vollständig", type: "boolean" }] },
      { key: "puzzles", labelKey: "marketplace.sub.puzzles", fallback: "Puzzles", attributes: [{ key: "complete", labelKey: "listing.complete", fallback: "Vollständig", type: "boolean" }] },
      { key: "building_sets", labelKey: "marketplace.sub.buildingSets", fallback: "Baukästen", attributes: [BRAND_ATTR, { key: "age_group", labelKey: "listing.ageGroup", fallback: "Altersgruppe", type: "text" }, { key: "complete", labelKey: "listing.complete", fallback: "Vollständig", type: "boolean" }] },
      { key: "dolls_figures", labelKey: "marketplace.sub.dollsFigures", fallback: "Puppen & Figuren", attributes: [BRAND_ATTR, { key: "original_packaging", labelKey: "listing.originalPackaging", fallback: "Originalverpackung", type: "boolean" }] },
      { key: "educational_toys", labelKey: "marketplace.sub.educationalToys", fallback: "Lernspielzeug", attributes: [BRAND_ATTR, { key: "age_group", labelKey: "listing.ageGroup", fallback: "Altersgruppe", type: "text" }] },
      { key: "outdoor_toys", labelKey: "marketplace.sub.outdoorToys", fallback: "Outdoor-Spielzeug", attributes: [BRAND_ATTR] },
      { key: "remote_controlled", labelKey: "marketplace.sub.remoteControlled", fallback: "Ferngesteuertes Spielzeug", attributes: [BRAND_ATTR, MODEL_ATTR] },
      { key: "toy_vehicles", labelKey: "marketplace.sub.toyVehicles", fallback: "Spielzeugfahrzeuge", attributes: [BRAND_ATTR] },
    ],
  },
  {
    key: "hobbies_collectibles",
    labelKey: "marketplace.cat.hobbiesCollectibles",
    fallback: "Hobby, Kunst & Sammeln",
    icon: "color-palette-outline",
    subcategories: [
      { key: "art", labelKey: "marketplace.sub.art", fallback: "Kunst", attributes: [{ key: "artist_manufacturer", labelKey: "listing.artistManufacturer", fallback: "Künstler/Hersteller", type: "text" }, { key: "year", labelKey: "listing.year", fallback: "Jahr", type: "number" }] },
      { key: "antiques", labelKey: "marketplace.sub.antiques", fallback: "Antiquitäten", attributes: [{ key: "year", labelKey: "listing.year", fallback: "Jahr", type: "number" }] },
      { key: "coins_stamps", labelKey: "marketplace.sub.coinsStamps", fallback: "Münzen & Briefmarken", attributes: [{ key: "year", labelKey: "listing.year", fallback: "Jahr", type: "number" }] },
      { key: "trading_cards", labelKey: "marketplace.sub.tradingCards", fallback: "Sammelkarten", attributes: [{ key: "series", labelKey: "listing.series", fallback: "Serie", type: "text" }, { key: "condition_grade", labelKey: "listing.conditionGrade", fallback: "Erhaltungsgrad", type: "single_select", options: CONDITION_GRADE_OPTIONS }] },
      { key: "model_building", labelKey: "marketplace.sub.modelBuilding", fallback: "Modellbau", attributes: [BRAND_ATTR] },
      { key: "crafts", labelKey: "marketplace.sub.crafts", fallback: "Handarbeit & Basteln", attributes: [BRAND_ATTR, MATERIAL_ATTR] },
      { key: "collectible_figures", labelKey: "marketplace.sub.collectibleFigures", fallback: "Sammelfiguren", attributes: [BRAND_ATTR, { key: "original_packaging", labelKey: "listing.originalPackaging", fallback: "Originalverpackung", type: "boolean" }] },
      { key: "memorabilia", labelKey: "marketplace.sub.memorabilia", fallback: "Fanartikel & Memorabilia", attributes: [{ key: "authenticity_proof", labelKey: "listing.authenticityProof", fallback: "Echtheitsnachweis", type: "boolean" }] },
      { key: "other_collectibles", labelKey: "marketplace.sub.otherCollectibles", fallback: "Weitere Sammlerstücke", attributes: [] },
    ],
  },
  {
    key: "beauty_wellness",
    labelKey: "marketplace.cat.beautyWellness",
    fallback: "Beauty, Pflege & Wellness",
    icon: "flower-outline",
    subcategories: [
      { key: "skincare", labelKey: "marketplace.sub.skincare", fallback: "Hautpflege", attributes: [BRAND_ATTR, { key: "sealed", labelKey: "listing.sealed", fallback: "Versiegelt", type: "boolean", required: true }, { key: "unused", labelKey: "listing.unused", fallback: "Unbenutzt", type: "boolean", required: true }] },
      { key: "makeup", labelKey: "marketplace.sub.makeup", fallback: "Make-up", attributes: [BRAND_ATTR, { key: "sealed", labelKey: "listing.sealed", fallback: "Versiegelt", type: "boolean", required: true }, { key: "unused", labelKey: "listing.unused", fallback: "Unbenutzt", type: "boolean", required: true }] },
      { key: "haircare", labelKey: "marketplace.sub.haircare", fallback: "Haarpflege", attributes: [BRAND_ATTR, { key: "sealed", labelKey: "listing.sealed", fallback: "Versiegelt", type: "boolean", required: true }, { key: "unused", labelKey: "listing.unused", fallback: "Unbenutzt", type: "boolean", required: true }] },
      { key: "hair_styling", labelKey: "marketplace.sub.hairStyling", fallback: "Haarstyling", attributes: [BRAND_ATTR] },
      { key: "fragrances", labelKey: "marketplace.sub.fragrances", fallback: "Düfte", attributes: [BRAND_ATTR, { key: "sealed", labelKey: "listing.sealed", fallback: "Versiegelt", type: "boolean", required: true }] },
      { key: "nailcare", labelKey: "marketplace.sub.nailcare", fallback: "Nagelpflege", attributes: [BRAND_ATTR, { key: "unused", labelKey: "listing.unused", fallback: "Unbenutzt", type: "boolean", required: true }] },
      { key: "wellness_devices", labelKey: "marketplace.sub.wellnessDevices", fallback: "Wellnessgeräte", attributes: [BRAND_ATTR, MODEL_ATTR] },
      { key: "beauty_devices", labelKey: "marketplace.sub.beautyDevices", fallback: "Beauty-Geräte", attributes: [BRAND_ATTR, MODEL_ATTR] },
      { key: "personal_care", labelKey: "marketplace.sub.personalCare", fallback: "Körperpflege", attributes: [BRAND_ATTR, { key: "unused", labelKey: "listing.unused", fallback: "Unbenutzt", type: "boolean", required: true }] },
      { key: "beauty_accessories", labelKey: "marketplace.sub.beautyAccessories", fallback: "Beauty-Zubehör", attributes: [BRAND_ATTR] },
    ],
  },
  {
    key: "pet_supplies",
    labelKey: "marketplace.cat.petSupplies",
    fallback: "Tierbedarf",
    icon: "paw-outline",
    subcategories: [
      { key: "dog_supplies", labelKey: "marketplace.sub.dogSupplies", fallback: "Hundebedarf", attributes: [BRAND_ATTR, SIZE_ATTR, { key: "pet_type", labelKey: "listing.petType", fallback: "Tierart", type: "text" }] },
      { key: "cat_supplies", labelKey: "marketplace.sub.catSupplies", fallback: "Katzenbedarf", attributes: [BRAND_ATTR] },
      { key: "small_pet_supplies", labelKey: "marketplace.sub.smallPetSupplies", fallback: "Kleintierbedarf", attributes: [BRAND_ATTR] },
      { key: "bird_supplies", labelKey: "marketplace.sub.birdSupplies", fallback: "Vogelbedarf", attributes: [BRAND_ATTR] },
      { key: "aquarium", labelKey: "marketplace.sub.aquarium", fallback: "Aquaristik", attributes: [BRAND_ATTR] },
      { key: "terrarium", labelKey: "marketplace.sub.terrarium", fallback: "Terraristik", attributes: [BRAND_ATTR] },
      { key: "pet_transport", labelKey: "marketplace.sub.petTransport", fallback: "Transport", attributes: [BRAND_ATTR, SIZE_ATTR] },
      { key: "pet_beds_furniture", labelKey: "marketplace.sub.petBedsFurniture", fallback: "Schlafplätze & Möbel", attributes: [BRAND_ATTR, SIZE_ATTR, MATERIAL_ATTR] },
      { key: "pet_care", labelKey: "marketplace.sub.petCare", fallback: "Pflege", attributes: [BRAND_ATTR] },
      { key: "pet_training", labelKey: "marketplace.sub.petTraining", fallback: "Training", attributes: [BRAND_ATTR] },
    ],
  },
  {
    key: "office_business",
    labelKey: "marketplace.cat.officeBusiness",
    fallback: "Büro, Gewerbe & Industrie",
    icon: "briefcase-outline",
    subcategories: [
      { key: "office_furniture", labelKey: "marketplace.sub.officeFurniture", fallback: "Büromöbel", attributes: [BRAND_ATTR, { key: "width_cm", labelKey: "listing.widthCm", fallback: "Breite (cm)", type: "number" }, { key: "height_cm", labelKey: "listing.heightCm", fallback: "Höhe (cm)", type: "number" }, { key: "depth_cm", labelKey: "listing.depthCm", fallback: "Tiefe (cm)", type: "number" }] },
      { key: "office_supplies", labelKey: "marketplace.sub.officeSupplies", fallback: "Bürobedarf", attributes: [BRAND_ATTR] },
      { key: "printers_scanners", labelKey: "marketplace.sub.printersScanners", fallback: "Drucker & Scanner", attributes: [BRAND_ATTR, MODEL_ATTR] },
      { key: "retail_equipment", labelKey: "marketplace.sub.retailEquipment", fallback: "Ladenausstattung", attributes: [BRAND_ATTR] },
      { key: "restaurant_equipment", labelKey: "marketplace.sub.restaurantEquipment", fallback: "Gastronomiebedarf", attributes: [BRAND_ATTR] },
      { key: "workshop_equipment", labelKey: "marketplace.sub.workshopEquipment", fallback: "Werkstattausstattung", attributes: [BRAND_ATTR, MODEL_ATTR] },
      { key: "machines", labelKey: "marketplace.sub.machines", fallback: "Maschinen", attributes: [BRAND_ATTR, MODEL_ATTR, { key: "power", labelKey: "listing.power", fallback: "Leistung", type: "text" }, { key: "voltage", labelKey: "listing.voltage", fallback: "Spannung", type: "text" }, { key: "weight_kg", labelKey: "listing.weightKg", fallback: "Gewicht (kg)", type: "number" }, { key: "operating_hours", labelKey: "listing.operatingHours", fallback: "Betriebsstunden", type: "number" }] },
      { key: "warehouse_logistics", labelKey: "marketplace.sub.warehouseLogistics", fallback: "Lager & Logistik", attributes: [BRAND_ATTR] },
      { key: "agriculture", labelKey: "marketplace.sub.agriculture", fallback: "Landwirtschaft", attributes: [BRAND_ATTR] },
      { key: "event_equipment", labelKey: "marketplace.sub.eventEquipment", fallback: "Veranstaltungstechnik", attributes: [BRAND_ATTR] },
      { key: "packaging", labelKey: "marketplace.sub.packaging", fallback: "Verpackung & Versand", attributes: [BRAND_ATTR] },
    ],
    attributes: [
      { key: "business_seller", labelKey: "listing.businessSeller", fallback: "Gewerblicher Verkäufer", type: "boolean" },
      { key: "vat_deductible", labelKey: "listing.vatDeductible", fallback: "MwSt. ausweisbar", type: "boolean" },
    ],
  },
  {
    key: "other",
    labelKey: "marketplace.cat.other",
    fallback: "Sonstiges",
    icon: "ellipsis-horizontal-outline",
    subcategories: [
      { key: "miscellaneous", labelKey: "marketplace.sub.miscellaneous", fallback: "Sonstige Artikel", attributes: [] },
      { key: "household_clearance", labelKey: "marketplace.sub.householdClearance", fallback: "Haushaltsauflösung", attributes: [] },
      { key: "bundles", labelKey: "marketplace.sub.bundles", fallback: "Pakete & Konvolute", attributes: [] },
      { key: "uncategorized_parts", labelKey: "marketplace.sub.uncategorizedParts", fallback: "Nicht zugeordnete Ersatzteile", attributes: [] },
    ],
  },
];

export function getCategoryConfig(key: string): MarketplaceCategory | undefined {
  return MARKETPLACE_CATEGORIES.find((c) => c.key === key);
}

export function getSubcategories(categoryKey: string): MarketplaceSubcategory[] {
  const cat = getCategoryConfig(categoryKey);
  return cat?.subcategories ?? [];
}

export function getCategoryAttributes(categoryKey: string, subcategoryKey?: string): MarketplaceAttribute[] {
  const cat = getCategoryConfig(categoryKey);
  if (!cat) return [];
  const sub = subcategoryKey ? cat.subcategories.find((s) => s.key === subcategoryKey) : undefined;
  const catAttrs = cat.attributes ?? [];
  const subAttrs = sub?.attributes ?? [];
  return [...catAttrs, ...subAttrs];
}

export function isValidSubcategory(categoryKey: string, subcategoryKey: string): boolean {
  const cat = getCategoryConfig(categoryKey);
  if (!cat) return false;
  return cat.subcategories.some((s) => s.key === subcategoryKey);
}

export function normalizeCategory(key: string): string {
  if (LEGACY_TO_CANONICAL[key]) return LEGACY_TO_CANONICAL[key];
  if (MARKETPLACE_CATEGORIES.some((c) => c.key === key)) return key;
  return key;
}
