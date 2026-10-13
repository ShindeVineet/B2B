"""Geofabrik India -> atomic local POI index. Run with OSM_PYTHON via refresh-osm-poi.mjs."""
import os, sys, re, unicodedata, subprocess, pathlib, hashlib
from urllib.parse import urlsplit, unquote
import osmium, psycopg
url = urlsplit(os.environ['DATABASE_URL'])
conn = psycopg.connect(host=url.hostname, port=url.port or 5432, user=unquote(url.username), password=unquote(url.password or ''), dbname=unquote(url.path[1:]), autocommit=True)
source = os.environ.get('OSM_EXTRACT_URL', 'https://download.geofabrik.de/asia/india-latest.osm.pbf')
cache = pathlib.Path('.cache/osm'); cache.mkdir(parents=True, exist_ok=True)
pbf = pathlib.Path(os.environ.get('OSM_PBF_PATH', str(cache/'india-latest.osm.pbf')))
common = {'pvt','private','ltd','limited','the','and'}
def normalized(value):
    text = unicodedata.normalize('NFKC', value).lower()
    text = ''.join(c if c.isalnum() or c.isspace() else ' ' for c in text)
    return ' '.join(w for w in text.split() if w not in common)
try:
    if not conn.execute('SELECT pg_try_advisory_lock(928040)').fetchone()[0]:
        print('Refresh already running', flush=True); sys.exit(0)
    last = conn.execute("SELECT refreshed_at > now() - interval '1 month' FROM osm_poi_refresh WHERE id='india'").fetchone()
    if '--force' not in sys.argv and last and last[0]:
        print('POI index is current', flush=True); sys.exit(0)
    if not os.environ.get('OSM_PBF_PATH'):
        partial = str(pbf)+'.part'
        subprocess.run(['curl','-4','--fail','--location','--retry','2','--connect-timeout','20','--max-time','3600','--output',partial,source],check=True)
        # Verify the complete download against the provider checksum before replacing the cache.
        checksum = subprocess.check_output(['curl','-4','--fail','--location','--connect-timeout','20','--max-time','60',source+'.md5'],text=True).split()[0]
        digest = hashlib.md5()
        with open(partial,'rb') as f:
            for chunk in iter(lambda:f.read(1024*1024),b''): digest.update(chunk)
        if digest.hexdigest()!=checksum: raise RuntimeError('Extract checksum mismatch')
        os.replace(partial,pbf)
    if not pbf.exists(): raise RuntimeError('PBF file missing')
    header = osmium.io.Reader(str(pbf)).header()
    timestamp = header.get('osmosis_replication_timestamp')
    # Reduce the location cache to referenced POI geometry, rather than all India road nodes.
    filtered = cache/'india-pois.osm.pbf'
    print('Filtering named POIs and their geometry references', flush=True)
    with osmium.BackReferenceWriter(str(filtered), ref_src=str(pbf), overwrite=True, relation_depth=5) as writer:
        class SelectPois(osmium.SimpleHandler):
            def node(self, obj): writer.add(obj)
            def way(self, obj): writer.add(obj)
            def relation(self, obj): writer.add(obj)
        SelectPois().apply_file(str(pbf), filters=[osmium.filter.KeyFilter('name','name:en'), osmium.filter.KeyFilter('shop','office','amenity','craft','tourism','healthcare','leisure','industrial','building')])
    print(f'Filtered POI extract: {filtered.stat().st_size} bytes', flush=True)
    conn.execute('CREATE TEMP TABLE osm_poi_stage (LIKE osm_poi_index INCLUDING DEFAULTS)')
    (cache/'nodes.idx').unlink(missing_ok=True)
    count = [0]
    with conn.cursor().copy('COPY osm_poi_stage (osm_id,name,normalized_name,lat,lng,address,kind) FROM STDIN') as copy:
        class Handler(osmium.SimpleHandler):
            def emit(self, obj, identity, locations):
                tags = dict(obj.tags)
                name = tags.get('name') or tags.get('name:en')
                kind = next((tags[k] for k in ['shop','office','amenity','craft','tourism','healthcare','leisure','industrial','building'] if tags.get(k)),None)
                if not name or not kind or not locations: return
                lat=(min(p[0] for p in locations)+max(p[0] for p in locations))/2
                lng=(min(p[1] for p in locations)+max(p[1] for p in locations))/2
                if not (6<=lat<=38 and 68<=lng<=98): return
                address=', '.join(tags[k] for k in ['addr:housenumber','addr:street','addr:suburb','addr:city','addr:postcode','addr:state'] if tags.get(k))
                copy.write_row((identity,name,normalized(name),lat,lng,address,kind)); count[0]+=1
                if count[0]%50000==0: print(f'Extracted {count[0]} POIs',flush=True)
            def node(self,n):
                if n.location.valid(): self.emit(n,'n'+str(n.id),[(n.location.lat,n.location.lon)])
            def way(self,w):
                if w.is_closed(): return # areas handled below, once
                self.emit(w,'w'+str(w.id),[(n.lat,n.lon) for n in w.nodes if n.location.valid()])
            def area(self,a):
                self.emit(a,('w' if a.from_way() else 'r')+str(a.orig_id()),[(n.lat,n.lon) for ring in a.outer_rings() for n in ring if n.location.valid()])
        Handler().apply_file(str(filtered), locations=True, idx='sparse_file_array,'+str(cache/'nodes.idx'), filters=[osmium.filter.KeyFilter('name','name:en'), osmium.filter.KeyFilter('shop','office','amenity','craft','tourism','healthcare','leisure','industrial','building')])
    if count[0]<1000: raise RuntimeError('Suspiciously small extract; preserving existing index')
    with conn.transaction():
        conn.execute('TRUNCATE osm_poi_index')
        conn.execute('INSERT INTO osm_poi_index SELECT DISTINCT ON (osm_id) * FROM osm_poi_stage ORDER BY osm_id')
        actual = conn.execute('SELECT count(*) FROM osm_poi_index').fetchone()[0]
        conn.execute("INSERT INTO osm_poi_refresh(id,source_url,refreshed_at,poi_count,source_timestamp) VALUES('india',%s,now(),%s,%s) ON CONFLICT(id) DO UPDATE SET source_url=excluded.source_url,refreshed_at=excluded.refreshed_at,poi_count=excluded.poi_count,source_timestamp=excluded.source_timestamp,last_error=NULL",(source,actual,timestamp))
    conn.execute('ANALYZE osm_poi_index')
    print(f'Loaded {actual} POIs; source timestamp {timestamp}',flush=True)
except Exception as e:
    conn.execute("INSERT INTO osm_poi_refresh(id,source_url,last_error) VALUES('india',%s,%s) ON CONFLICT(id) DO UPDATE SET last_error=excluded.last_error",(source,str(e)[:2000]))
    raise
finally:
    conn.close()
    (cache/'nodes.idx').unlink(missing_ok=True)
