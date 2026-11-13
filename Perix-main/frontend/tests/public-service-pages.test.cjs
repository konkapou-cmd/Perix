/* global __dirname */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const frontend = path.join(__dirname, "..");
const backend = path.join(frontend, "..", "backend");

test("public-service category IDs use the unified taxonomy with a hidden locations branch", () => {
  const taxonomy = JSON.parse(fs.readFileSync(path.join(backend, "public_services/taxonomy.json"), "utf8"));
  const categories = taxonomy.children.filter(node => !node.id.startsWith("ps:"));
  assert.equal(taxonomy.id, "public-services");
  assert.equal(categories.length, 10);
  const visible = categories.filter(node => !node.hidden);
  assert.equal(visible.length, 9);
  const hidden = categories.filter(node => node.hidden);
  assert.deepEqual(hidden.map(node => node.id), ["locations"]);
  for (const node of categories) {
    assert.ok(node.label_el && node.label_de && node.label_en, node.id);
    assert.ok(Array.isArray(node.children) && node.children.length > 0, node.id);
    for (const sub of node.children) assert.ok(sub.label_el && sub.label_de && sub.label_en, sub.id);
  }
  const subIds = categories.flatMap(node => (node.children || []).map(sub => sub.id));
  assert.equal(new Set(subIds).size, subIds.length, "subcategory ids are unique");
  assert.deepEqual(categories.map(node => node.id), ["civic-admin", "social-support", "health", "education-culture-sport", "employment", "economy-business", "environment", "construction-property-transport", "justice-safety", "locations"]);
});

test("public services use shared map pins and their full detail page renders a map", () => {
  const gateway = fs.readFileSync(path.join(frontend, "components/city/CityGatewayScreen.tsx"), "utf8");
  const card = fs.readFileSync(path.join(frontend, "components/city/PublicServiceCard.tsx"), "utf8");
  const resultCard = fs.readFileSync(path.join(frontend, "components/city/GatewayResultCard.tsx"), "utf8");
  const imageMap = fs.readFileSync(path.join(frontend, "lib/city/publicServiceImages.ts"), "utf8");
  const route = fs.readFileSync(path.join(frontend, "app/public-services/[id].tsx"), "utf8");
  assert.match(gateway, /r\.type === "public_service" \? "service"/);
  assert.match(card, /<BusinessMap initialRegion=\{mapRegion\} markers=\{marker\}/);
  assert.match(fs.readFileSync(path.join(frontend, "lib/city/publicServices.ts"), "utf8"), /coordinate_review_status === "approved"/);
  assert.match(card, /profile_image_url/);
  assert.match(card, /cover_image_url/);
  assert.match(card, /visual_is_illustration/);
  assert.match(resultCard, /getPublicServiceImages/);
  assert.match(resultCard, /visual_is_illustration/);
  assert.equal((imageMap.match(/profile: require\(/g) || []).length, 514);
  assert.equal((imageMap.match(/cover: require\(/g) || []).length, 514);
  assert.equal(fs.readdirSync(path.join(frontend, "assets/public-services/profiles")).filter(file => file.endsWith(".webp")).length, 481); // 514 entries share 481 distinct files (9 services share one profile, etc.)
  assert.equal(fs.readdirSync(path.join(frontend, "assets/public-services/covers")).filter(file => file.endsWith(".webp")).length, 6); // one shared cover per area (md, gar, aak, ach, syr, myk)
  for (const field of ["additional_phones", "additional_emails", "telephone_hours", "special_notice", "services_supported", "additional_fields", "source_rights_url", "coordinate_source_license"]) {
    assert.ok(card.includes(field), `detail card handles ${field}`);
  }
  assert.match(route, /<PublicServiceCard service=\{service\} full \/>/);
});

test("public-service artwork uses filled cover crops without padded contain-fit profiles", () => {
  const card = fs.readFileSync(path.join(frontend, "components/city/PublicServiceCard.tsx"), "utf8");
  const result = fs.readFileSync(path.join(frontend, "components/city/GatewayResultCard.tsx"), "utf8");
  assert.match(card, /style=\{styles\.avatarImage\} contentFit="cover"/);
  assert.match(card, /avatar: \{ width: 72, height: 72, borderRadius: 12/);
  assert.match(card, /avatarImage: \{ width: "100%", height: "100%"/);
  assert.match(result, /entity\.publicService && \{width:104,height:104\}/);
  assert.match(result, /contentFit="cover"/);
  assert.doesNotMatch(result, /entity\.publicService \? "contain" : "cover"/);
  assert.match(result, /entity\.publicService \? profileImage :/);
});

test("inspecting a public-service pin reuses the main map instead of mounting another map", () => {
  const inline = fs.readFileSync(path.join(frontend, "components/city/CityInlineDetails.tsx"), "utf8");
  const card = fs.readFileSync(path.join(frontend, "components/city/PublicServiceCard.tsx"), "utf8");
  assert.match(inline, /<PublicServiceCard service=\{entity\.publicService\} full showMap=\{false\}/);
  assert.match(card, /\{showMap && <View style=\{styles\.map\}/);
});
