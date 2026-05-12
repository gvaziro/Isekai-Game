---
date: 2026-05-12
agent: codex
action: create_and_update_facts
target: village_cardinal_layout, west_road_to_city_closed_by_fog, forest_* facts, village_square_is_information_hub, marcus_watches_roads_and_square, catacombs_are_young_dungeon
diff: |
  + добавлен общий факт о четырех направлениях деревни
  + добавлен факт о западной дороге в город, закрытой туманом
  + лесные факты уточнены: лес находится севернее деревни
  + катакомбы уточнены как южная точка деревни
  + восточная ферма связана с общей географией деревни
related_changes:
  - world/facts/village_cardinal_layout.md
  - world/facts/west_road_to_city_closed_by_fog.md
  - world/facts/forest_edge_has_return_rule.md
  - world/facts/forest_foraging_is_allowed.md
  - world/facts/forest_has_harvestable_mushrooms.md
  - world/facts/forest_is_endless_to_villagers.md
  - world/facts/forest_monsters_scale_with_distance.md
reason: Пользователь зафиксировал карту деревни по сторонам света: север — лес, юг — подземелье, восток — старая ферма, запад — путь в город под туманом.
---

География стартовой деревни теперь закреплена в фактах по сторонам света. Это должно помогать NPC отвечать на вопросы о направлении к лесу, ферме, катакомбам и дороге в город без путаницы.
