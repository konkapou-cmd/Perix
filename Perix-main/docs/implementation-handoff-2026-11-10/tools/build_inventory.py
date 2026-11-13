"""Reproducible, offline audit. Writes only this handoff's generated/ directory.

Run from any directory: python <path-to-this-file>
Requires Python 3 and the frontend's existing Node/TypeScript installation.
Does NOT import backend modules (which would initialize database/config).
"""
import ast
import csv
import hashlib
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
PACKAGE = HERE.parent
ROOT = PACKAGE.parent.parent
FRONTEND = ROOT / "frontend"
OUTPUT = PACKAGE / "generated"


def literal_assignment(tree, name):
    for node in ast.walk(tree):
        target = node.target if isinstance(node, ast.AnnAssign) else None
        targets = node.targets if isinstance(node, ast.Assign) else [target]
        if any(isinstance(t, ast.Name) and t.id == name for t in targets):
            return ast.literal_eval(node.value)
    raise ValueError(f"Missing literal assignment: {name}")


def write_csv(name, rows):
    with (OUTPUT / name).open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def main():
    database = ast.parse((ROOT / "backend/database.py").read_text(encoding="utf-8"))
    roots = literal_assignment(database, "CATEGORIES")
    allowed = literal_assignment(database, "ROOT_SERVICE_TYPES")
    bookings = literal_assignment(database, "ROOT_SERVICE_BOOKING_CONFIG")
    listings = ast.parse((ROOT / "backend/routes/listings.py").read_text(encoding="utf-8"))
    backend_products = literal_assignment(listings, "MARKETPLACE_SUBCATEGORIES")
    result = subprocess.run(["node", str(HERE / "frontend-snapshot.cjs")],
                            capture_output=True, text=True, encoding="utf-8", check=True)
    front = json.loads(result.stdout)
    proposal = json.loads((PACKAGE / "proposed-product-taxonomy.json").read_text(encoding="utf-8"))["roots"]
    OUTPUT.mkdir(exist_ok=True)
    icons = front["illustrations"]
    glyphs = set(front["glyphs"] or [])
    icon_rows = []

    def icon_row(domain, parent, key, status, mapping, label="", glyph="", note=""):
        asset = icons.get(mapping, {}).get(key, "")
        exists = bool(asset) and (FRONTEND / "lib" / asset).is_file()
        icon_rows.append(dict(domain=domain, parent=parent, key=key, taxonomy_status=status,
                              label_key=label, current_ionicon= glyph,
                              glyph_valid=(str(glyph in glyphs).lower() if glyph and glyphs else "not_checked"),
                              illustration=(str(Path("frontend/lib") / asset).replace("\\", "/") if asset else ""),
                              asset_exists=str(exists).lower(), note=note))

    frontend_products = {}
    for category in front["categories"]:
        root = category["key"]
        frontend_products[root] = [s["key"] for s in category["subcategories"]]
        icon_row("product-root", "", root, "current", "MARKETPLACE_PARENT_ILLUSTRATIONS", category["labelKey"], category["icon"])
        for sub in category["subcategories"]:
            status = "current" if sub["key"] in proposal.get(root, []) else "current_proposed_retirement_or_move"
            icon_row("product-subcategory", root, sub["key"], status, "MARKETPLACE_SUBCATEGORY_ILLUSTRATIONS", sub["labelKey"], "", "No dedicated subcategory Ionicon field in current taxonomy; illustration is available separately.")
    for root, subs in proposal.items():
        if root not in frontend_products:
            icon_row("product-root", "", root, "proposed", "MARKETPLACE_PARENT_ILLUSTRATIONS")
        for key in subs:
            if key not in frontend_products.get(root, []):
                icon_row("product-subcategory", root, key, "proposed", "MARKETPLACE_SUBCATEGORY_ILLUSTRATIONS")
    for root, subs in backend_products.items():
        for key in set(subs) - set(frontend_products.get(root, [])):
            icon_row("product-subcategory", root, key, "backend_only_legacy_candidate", "MARKETPLACE_SUBCATEGORY_ILLUSTRATIONS")
    for root in roots:
        slug = root["slug"]
        matrix = front["matrix"].get(slug, {})
        icon_row("business-root", "", slug, "current", "ROOT_CATEGORY_ILLUSTRATIONS", glyph=matrix.get("icon", ""))
        for group in root["groups"]:
            icon_row("business-group", slug, slug + "--" + group["slug"], "current", "CATEGORY_GROUP_ILLUSTRATIONS")
            for key in group["subcategories"]:
                icon_row("business-subcategory", slug, key, "current", "SUBCATEGORY_ILLUSTRATIONS")
    for key in ["opticians", "ophthalmologists", "optical-stores"]:
        icon_row("business-subcategory", "healthcare", key, "proposed", "SUBCATEGORY_ILLUSTRATIONS", note="Proposal in supplied brief; not inserted into runtime category tree.")
    for key, module in front["modules"].items():
        icon_row("service-module", "|".join(module["allowedRootCategories"]), key, "current", "SERVICE_MODULE_ILLUSTRATIONS", module["labelKey"], module["icon"])
    for key in ["apartment", "house", "studio", "room", "commercial"]:
        asset = FRONTEND / "assets/illustrations/categories/sub" / (key + ".webp")
        icon_rows.append(dict(domain="property-type", parent="home_rental", key=key,
                              taxonomy_status="artwork_mapping_not_proof_of_api_enum", label_key="",
                              current_ionicon="", glyph_valid="not_checked",
                              illustration=asset.relative_to(ROOT).as_posix(), asset_exists=str(asset.is_file()).lower(),
                              note="See frontend/lib/civicIllustrations.ts PROPERTY_ILLUSTRATIONS and backend/models/listing.py."))
    for key, glyph in [("classified_ad", "megaphone-outline"), ("personal_item", "pricetag-outline"), ("items", "bag-handle-outline"), ("listings", "home-outline")]:
        icon_rows.append(dict(domain="creation-or-section", parent="", key=key, taxonomy_status="proposed_ui_key_not_api_enum", label_key="", current_ionicon="", glyph_valid=str(glyph in glyphs).lower() if glyphs else "not_checked", illustration="", asset_exists="false", note="Proposed fallback: " + glyph))
    write_csv("icon-inventory.csv", icon_rows)

    service_rows = []
    for root, types in allowed.items():
        frontend_types = front["matrix"].get(root, {}).get("allowedModules", [])
        for key in types:
            conf = bookings.get(root, {}).get(key, {})
            backend_mode = conf.get("mode") or ("time_slot" if conf.get("slots") else "request" if conf.get("booking") else "none")
            module = front["modules"].get(key, {})
            frontend_mode = front["modes"].get(key, "MISSING")
            service_rows.append(dict(root=root, service_type=key, frontend_allowed=str(key in frontend_types).lower(),
                                     backend_mode=backend_mode, frontend_mode=frontend_mode,
                                     mode_matches=str(backend_mode == frontend_mode).lower(),
                                     module_root_matches=str(root in module.get("allowedRootCategories", [])).lower(),
                                     cta=module.get("ctaType", ""), required_fields="|".join(module.get("requiredFields", [])),
                                     fields="|".join(module.get("fields", []))))
    write_csv("service-sync.csv", service_rows)
    service_models = ast.parse((ROOT / "backend/models/service.py").read_text(encoding="utf-8"))
    model_fields = {
        node.name: {field.target.id for field in node.body if isinstance(field, ast.AnnAssign) and isinstance(field.target, ast.Name)}
        for node in service_models.body if isinstance(node, ast.ClassDef)
    }
    field_rows = []
    for key, module in front["modules"].items():
        for field in sorted(set(module.get("fields", [])) | set(module.get("requiredFields", []))):
            field_rows.append(dict(service_type=key, field=field,
                                   frontend_required=str(field in module.get("requiredFields", [])).lower(),
                                   backend_create_declares=str(field in model_fields["ServiceCreate"]).lower(),
                                   backend_update_declares=str(field in model_fields["ServiceUpdate"]).lower(),
                                   backend_response_declares=str(field in model_fields["ServiceResponse"]).lower(),
                                   note="Field presence only, not validation strength or form round-trip proof."))
    write_csv("service-field-contract.csv", field_rows)
    decisions = json.loads((PACKAGE / "approved-service-decisions.json").read_text(encoding="utf-8"))
    approved = {}
    current_specialties = {root["slug"]: {key for group in root["groups"] for key in group["subcategories"]} for root in roots}
    for root, sector in decisions["sectors"].items():
        if sector["status"] != "approved_specification":
            raise ValueError(f"Unsupported decision status for {root}")
        for module, mode in sector.get("module_booking_modes", {}).items():
            if module not in allowed.get(root, []) or front["modes"].get(module) != mode:
                raise ValueError(f"Approved booking mode requires review: {root}/{module}")
        reviewed_keys = set()
        for module_group in sector["module_groups"]:
            modules = module_group["allowed_modules"]
            if len(modules) != len(set(modules)) or not set(modules).issubset(allowed.get(root, [])):
                raise ValueError(f"Invalid or duplicate approved modules for {root}")
            conditions = module_group.get("module_conditions", {})
            if not set(conditions).issubset(modules):
                raise ValueError(f"Conditions reference unapproved modules for {root}")
            quota_buckets = {
                module: sector.get("module_quota_buckets", {}).get(module, sector["quota_bucket"])
                for module in modules
            }
            if "mixed_by_module" in quota_buckets.values():
                raise ValueError(f"Mixed quota decision needs an explicit bucket per module for {root}")
            known_limits = dict(sector.get("quota_limits", {}))
            known_limits.setdefault("professional_service", decisions["base_business_professional_service_limit"])
            if "catalog_product_limit" in sector:
                known_limits.setdefault("catalog_product", sector["catalog_product_limit"])
            if any(type(value) is not int or value < 1 for value in known_limits.values()):
                raise ValueError(f"Invalid approved quota limit for {root}")
            module_limits = {module: known_limits.get(bucket, "pending_approval") for module, bucket in quota_buckets.items()}
            additional_constraints = []
            for constraint in sector.get("additional_quota_constraints", []):
                if constraint["module"] not in allowed.get(root, []) or known_limits.get(constraint["bucket"]) != constraint["limit"]:
                    raise ValueError(f"Additional quota constraint requires review: {root}")
                if constraint["module"] in modules:
                    additional_constraints.append(constraint)
            for key in module_group["subcategories"]:
                if key in reviewed_keys:
                    raise ValueError(f"Duplicate specialty decision: {root}/{key}")
                reviewed_keys.add(key)
                approved[(root, key)] = {
                    "modules": modules, "quota_bucket": sector["quota_bucket"],
                    "module_quota_buckets": quota_buckets, "module_conditions": conditions,
                    "module_limits": module_limits,
                    "additional_quota_constraints": additional_constraints,
                    "explicitly_no_service_modules": not modules,
                }
        if reviewed_keys != current_specialties.get(root, set()):
            raise ValueError(f"Approved sector taxonomy changed; review required: {root}")
    business_rows = []
    for root in roots:
        for group in root["groups"]:
            for key in group["subcategories"]:
                decision = approved.get((root["slug"], key))
                cross_domain = decisions["sectors"].get(root["slug"], {}).get("professional_property_listing_requirement")
                property_capability = cross_domain if cross_domain and key in cross_domain["subcategories"] else None
                if property_capability:
                    rental_policy = decisions["sectors"].get("rentals", {})
                    if property_capability["status"] != "approved_specification_not_implemented" or property_capability["property_quota"] != rental_policy.get("quota_limits", {}).get("rental_inventory"):
                        raise ValueError(f"Cross-domain property approval requires review: {root['slug']}/{key}")
                business_rows.append(dict(root=root["slug"], group=group["slug"], subcategory=key,
                                          current_root_modules="|".join(allowed.get(root["slug"], [])),
                                          reviewed_profession_modules="|".join(decision["modules"]) if decision else "",
                                          quota_bucket=decision["quota_bucket"] if decision else "UNDECIDED",
                                          approved_module_quota_buckets=json.dumps(decision["module_quota_buckets"], sort_keys=True) if decision else "",
                                          approved_module_limits=json.dumps(decision["module_limits"], sort_keys=True) if decision else "",
                                          approved_additional_quota_constraints=json.dumps(decision["additional_quota_constraints"], sort_keys=True) if decision else "",
                                          approved_module_conditions=json.dumps(decision["module_conditions"], sort_keys=True) if decision else "",
                                          approved_cross_domain_capabilities=json.dumps({"professional_property_listings": property_capability}, sort_keys=True) if property_capability else "",
                                          explicitly_no_service_modules=str(decision["explicitly_no_service_modules"]).lower() if decision else "",
                                          review_status="approved_specification_not_implemented" if decision else "needs_profession_review"))
    write_csv("business-service-review.csv", business_rows)
    product_policy_tree = ast.parse((ROOT / "backend/utils/product_permissions.py").read_text(encoding="utf-8"))
    product_policy = literal_assignment(product_policy_tree, "BUSINESS_PRODUCT_POLICY")
    retail_product_rows = []
    retail_completion = decisions["sectors"].get("shopping-retail", {}).get("product_permission_completion", {})
    for root in roots:
        if root["slug"] != "shopping-retail":
            continue
        for group in root["groups"]:
            for key in group["subcategories"]:
                current = product_policy.get(root["slug"], {}).get(key)
                paths = []
                for category, subs in (current or {}).items():
                    paths.extend(f"{category}/{sub}" for sub in (backend_products.get(category, []) if subs == "*" else subs or []))
                invalid_paths = [p for p in paths if p.split("/", 1)[1] not in backend_products.get(p.split("/", 1)[0], [])]
                notes = ["Current policy snapshot only; not approval of new paths or proposed taxonomy."]
                if current is None:
                    notes.append("Missing specialty mapping; no permissive fallback is authorized.")
                if key == "florists":
                    notes.append("Current scope is home_garden_diy/garden and decoration; proposed flowers_gifts is not an active backend product root.")
                if "*" in (current or {}).values():
                    notes.append("Current wildcard expanded against current backend taxonomy only; future paths require explicit review.")
                retail_product_rows.append(dict(
                    root=root["slug"], subcategory=key,
                    current_policy_present=str(current is not None).lower(),
                    current_backend_policy_json=json.dumps(current or {}, sort_keys=True),
                    current_backend_product_paths="|".join(sorted(paths)),
                    invalid_current_backend_product_paths="|".join(sorted(invalid_paths)),
                    approved_new_product_paths="|".join(retail_completion.get("approved_new_product_paths", {}).get(key, [])),
                    review_status="exact_new_paths_pending_approval",
                    note=" ".join(notes),
                ))
    write_csv("retail-product-policy-review.csv", retail_product_rows)
    pairs_backend = {(r, k) for r, keys in backend_products.items() for k in keys}
    pairs_frontend = {(r, k) for r, keys in frontend_products.items() for k in keys}
    summary = dict(
        scope="Offline static working-tree snapshot, not deployed database or end-to-end verification",
        approved_service_policy_version=decisions["policy_version"],
        approved_service_sectors=sorted(decisions["sectors"]),
        approved_service_specialties=len(approved),
        pending_service_specialties=len(business_rows) - len(approved),
        retail_product_policy_review_rows=len(retail_product_rows),
        retail_specialties_without_current_product_mapping=[r["subcategory"] for r in retail_product_rows if r["current_policy_present"] == "false"],
        retail_invalid_current_product_paths=[r for r in retail_product_rows if r["invalid_current_backend_product_paths"]],
        approved_service_decisions_sha256=hashlib.sha256((PACKAGE / "approved-service-decisions.json").read_bytes()).hexdigest(),
        source_sha256={relative: hashlib.sha256((ROOT / relative).read_bytes()).hexdigest()
                        for relative in ["backend/database.py", "backend/routes/listings.py", "backend/models/service.py", "backend/utils/product_permissions.py",
                                        "frontend/lib/marketplace/marketplaceTaxonomy.ts", "frontend/lib/config/serviceModules.ts",
                                        "frontend/lib/config/serviceCategoryMatrix.ts", "frontend/lib/illustrationSources.generated.ts"]},
        business_roots=len(roots), business_subcategories=len(business_rows),
        frontend_product_roots=len(frontend_products), frontend_product_subcategories=sum(map(len, frontend_products.values())),
        backend_product_roots=len(backend_products), backend_product_paths=len(pairs_backend),
        proposed_product_roots=len(proposal), proposed_product_paths=sum(map(len, proposal.values())),
        backend_only_product_paths=sorted("/".join(p) for p in pairs_backend - pairs_frontend),
        frontend_only_product_paths=sorted("/".join(p) for p in pairs_frontend - pairs_backend),
        service_root_entries=len(allowed), service_unique_types=len({k for keys in allowed.values() for k in keys}),
        service_root_diffs={root: {"backend": sorted(allowed.get(root, [])), "frontend": sorted(front["matrix"].get(root, {}).get("allowedModules", []))}
                            for root in set(allowed) | set(front["matrix"])
                            if set(allowed.get(root, [])) != set(front["matrix"].get(root, {}).get("allowedModules", []))},
        service_mode_mismatches=[r for r in service_rows if r["mode_matches"] != "true"],
        module_root_mismatches=[r for r in service_rows if r["module_root_matches"] != "true"],
        business_roots_without_service_types=[r["slug"] for r in roots if not allowed.get(r["slug"])],
        illustration_counts={name: len(value) for name, value in icons.items() if isinstance(value, dict)},
        missing_assets=[{"domain": r["domain"], "key": r["key"], "status": r["taxonomy_status"]} for r in icon_rows if r["illustration"] and r["asset_exists"] == "false"],
        proposed_business_icons_without_artwork=[r["key"] for r in icon_rows if r["domain"] == "business-subcategory" and r["taxonomy_status"] == "proposed" and not r["illustration"]],
        invalid_current_glyphs=[r for r in icon_rows if r["current_ionicon"] and r["glyph_valid"] == "false"],
        service_field_contract_gaps=[r for r in field_rows if r["backend_create_declares"] != "true" or r["backend_response_declares"] != "true"],
    )
    (OUTPUT / "audit-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
