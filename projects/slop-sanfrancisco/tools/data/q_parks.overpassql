[out:json][timeout:240];
(
  way["natural"="water"](37.70,-122.52,37.82,-122.36);
  relation["natural"="water"](37.70,-122.52,37.82,-122.36);
  way["highway"~"^(footway|path|cycleway)$"]["access"!="private"](37.762,-122.512,37.775,-122.452);
);
out geom;
