[out:json][timeout:180];
(
  way["name"~"^(Transamerica Pyramid|Salesforce Tower|Ferry Building|Coit Tower|San Francisco City Hall|Palace of Fine Arts|Sutro Tower|181 Fremont|Millennium Tower|555 California Street|Painted Ladies)$"](37.70,-122.52,37.84,-122.36);
  relation["name"~"^(Transamerica Pyramid|Salesforce Tower|Ferry Building|San Francisco City Hall|Palace of Fine Arts)$"](37.70,-122.52,37.84,-122.36);
  way["bridge"]["name"~"Golden Gate Bridge|Bay Bridge"](37.70,-122.53,37.84,-122.35);
);
out geom;
