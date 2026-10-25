#!/bin/bash
# tools/fetch-data.sh — downloads the raw inputs for tools/build-geodata.mjs into tools/raw/ (gitignored).
# usage: bash tools/fetch-data.sh [--no-dem] [--no-osm]
#
# Sources
#   DataSF (Socrata, data.sf.gov):
#     ynuv-fyni  Building Footprints (2010 LiDAR: ground elevation, median roof height, peak)
#     3psu-pn9h  Streets – Active and Retired (centrelines, class, one-way, node ids)
#     acdm-wktn  Parcels – Active and Retired (block/lot polygons → curb blocks, zoning)
#     3i4a-hu95  Zoning Map – Zoning Districts
#     tkzw-k3nq  Street Tree Inventory
#     3nje-yn2u  RPD Parks
#     j2bu-swwd  Analysis Neighborhoods
#   USGS 3DEP (prd-tnm.s3.amazonaws.com):
#     1 m DEM, project CA_SanFrancisco_B23, UTM 10N tiles x54y418 x54y419 x55y418 x55y419
#     1/3 arc-second DEM n38w123 (Bay ring: Marin, East Bay, islands)
#   OpenStreetMap via Overpass (optional): coastline, piers, landmark names
set -euo pipefail
cd "$(dirname "$0")"
RAW=raw
mkdir -p "$RAW"
DEM=1; OSM=1
for a in "$@"; do
  case $a in
    --no-dem) DEM=0 ;;
    --no-osm) OSM=0 ;;
    *) echo "unknown option $a" >&2; exit 1 ;;
  esac
done

UA="slop-sanfrancisco/1.0 (three.js city sim)"
get() { # get <url> <out> — skip if present, download atomically, retry
  local url=$1 out=$2
  if [ -s "$out" ]; then echo "have $out"; return; fi
  for i in 1 2 3 4 5; do
    if curl -sSfL -m 1800 -A "$UA" -o "$out.part" "$url"; then mv "$out.part" "$out"; echo "ok $out $(wc -c < "$out")"; return; fi
    echo "retry $i $url" >&2; sleep $((i * 3))
  done
  rm -f "$out.part"; echo "FAILED $url" >&2; return 1
}

# Socrata GeoJSON in pages (the API caps a request at 50k rows); pages are merged by build-geodata
socrata() { # socrata <id> <name> <select> [where]
  local id=$1 name=$2 sel=$3 where=${4:-}
  local total pages
  total=$(curl -sSf -G -A "$UA" "https://data.sf.gov/resource/$id.json" --data-urlencode "\$select=count(*)" ${where:+--data-urlencode "\$where=$where"} | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)[0].count))')
  pages=$(( (total + 49999) / 50000 ))
  echo "$name: $total rows in $pages page(s)"
  for ((p = 0; p < pages; p++)); do
    local out="$RAW/$name.$p.geojson"
    [ -s "$out" ] && { echo "have $out"; continue; }
    local q
    q=$(node -e 'const [sel,where,off]=process.argv.slice(1);const u=new URLSearchParams({$select:sel,$limit:"50000",$offset:off,$order:":id"});if(where)u.set("$where",where);console.log(u.toString())' "$sel" "$where" $((p * 50000)))
    get "https://data.sf.gov/resource/$id.geojson?$q" "$out"
  done
}

socrata ynuv-fyni footprints "sf16_bldgid,gnd_min_m,median_1st_m,hgt_median_m,peak_1st_m,shape"
socrata 3psu-pn9h streets "cnn,streetname,street,st_type,classcode,layer,oneway,f_node_cnn,t_node_cnn,nhood,line" "active = true"
socrata acdm-wktn parcels "blklot,block_num,zoning_code,shape" "active = true"
socrata 3i4a-hu95 zoning "zoning,zoning_sim,gen,the_geom"
socrata tkzw-k3nq trees "treeid,species,planttype,dbhrange,latitude,longitude" "latitude IS NOT NULL"
socrata 3nje-yn2u parks "map_park_n,acres,the_geom"
socrata j2bu-swwd neighborhoods "nhood,the_geom"

if [ "$DEM" = 1 ]; then
  for t in x54y418 x54y419 x55y418 x55y419; do
    get "https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1m/Projects/CA_SanFrancisco_B23/TIFF/USGS_1M_10_${t}_CA_SanFrancisco_B23.tif" "$RAW/dem1m_$t.tif"
  done
  get "https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/13/TIFF/current/n38w123/USGS_13_n38w123.tif" "$RAW/dem13_n38w123.tif"
fi

if [ "$OSM" = 1 ]; then
  for q in data/q_*.overpassql; do
    n=$(basename "$q" .overpassql); n=${n#q_}
    [ -s "$RAW/osm_$n.json" ] && { echo "have osm_$n"; continue; }
    bash overpass.sh "$RAW/osm_$n.json" "$q" 3 || echo "warning: Overpass unavailable for $n (optional; is overpass-api.de allowed?)" >&2
  done
fi
echo done
