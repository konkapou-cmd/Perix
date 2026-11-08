/* global __dirname */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const frontend = path.join(__dirname, "..");
const backend = path.join(frontend, "..", "backend");

test("public-service category IDs use the 16-category imported taxonomy", () => {
  const taxonomy = JSON.parse(fs.readFileSync(path.join(backend, "public_services/taxonomy.json"), "utf8"));
  const categories = taxonomy.children.filter(node => !node.id.startsWith("ps:"));
  assert.equal(taxonomy.id, "public-services");
  assert.equal(categories.length, 16);
  assert.ok(categories.every(node => node.label_el && node.label_de && node.label_en));
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
  assert.equal((imageMap.match(/profile: require\(/g) || []).length, 90);
  assert.equal((imageMap.match(/cover: require\(/g) || []).length, 90);
  assert.equal(fs.readdirSync(path.join(frontend, "assets/public-services/profiles")).filter(file => file.endsWith(".webp")).length, 90);
  assert.equal(fs.readdirSync(path.join(frontend, "assets/public-services/covers")).filter(file => file.endsWith(".webp")).length, 90);
  for (const field of ["additional_phones", "additional_emails", "telephone_hours", "special_notice", "services_supported", "additional_fields", "source_rights_url", "coordinate_source_license"]) {
    assert.ok(card.includes(field), `detail card handles ${field}`);
  }
  assert.match(route, /<PublicServiceCard service=\{service\} full \/>/);
});
