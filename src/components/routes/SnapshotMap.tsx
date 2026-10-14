"use client";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { routeLegs } from "@/lib/routes/geometry";
import { inIndia, type Coordinates } from "@/lib/location";
export default function SnapshotMap({
  points,
  statuses,
  labels,
  onAreaSelect,
}: {
  points: Coordinates[];
  statuses: string[];
  labels?: string[];
  onAreaSelect?: (bounds: {
    south: number;
    north: number;
    west: number;
    east: number;
  }) => void;
}) {
  const [selecting, setSelecting] = useState(false),
    [hint, setHint] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(onAreaSelect);
  const selectingRef = useRef(selecting);
  useEffect(() => {
    callback.current = onAreaSelect;
  }, [onAreaSelect]);
  useEffect(() => {
    selectingRef.current = selecting;
  }, [selecting]);
  const dataKey = JSON.stringify({ points, statuses, labels });
  const areaEnabled = !!onAreaSelect;
  useEffect(() => {
    if (!ref.current) return;
    const { points, statuses, labels } = JSON.parse(dataKey) as {
      points: Coordinates[];
      statuses: string[];
      labels?: string[];
    };
    const map = L.map(ref.current, {
      boxZoom: !areaEnabled,
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
    }).setView({ lat: 20.59, lng: 78.96 }, 5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);
    let corner: L.LatLng | null = null;
    let cornerMarker: L.CircleMarker | null = null;
    let rectangle: L.Rectangle | null = null;
    let handles: L.Marker[] = [];
    const handleIcon = L.divIcon({
      className: "",
      html: '<span style="display:block;width:18px;height:18px;border-radius:50%;background:#ff4500;border:3px solid white;box-shadow:0 1px 5px #475569" title="Drag to resize"></span>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
    const notify = (bounds: L.LatLngBounds) => callback.current?.({
      south: bounds.getSouth(),
      north: bounds.getNorth(),
      west: bounds.getWest(),
      east: bounds.getEast(),
    });
    const drawResizableRectangle = (bounds: L.LatLngBounds) => {
      rectangle?.remove();
      handles.forEach((handle) => handle.remove());
      rectangle = L.rectangle(bounds, { color: "#ff4500", weight: 2 }).addTo(map);
      const makeHandle = (position: L.LatLng, opposite: () => L.LatLng) => {
        const marker = L.marker(position, { draggable: true, icon: handleIcon }).addTo(map);
        marker.on("drag", () => rectangle?.setBounds(L.latLngBounds(marker.getLatLng(), opposite())));
        marker.on("dragend", () => {
          const resized = L.latLngBounds(marker.getLatLng(), opposite());
          drawResizableRectangle(resized);
          setHint("Rectangle resized. Drag either orange handle to adjust it again.");
          notify(resized);
        });
        return marker;
      };
      handles = [
        makeHandle(bounds.getSouthWest(), () => bounds.getNorthEast()),
        makeHandle(bounds.getNorthEast(), () => bounds.getSouthWest()),
      ];
    };
    if (areaEnabled)
      map.on("click", (event: L.LeafletMouseEvent) => {
        if (!selectingRef.current && !event.originalEvent.shiftKey) return;
        if (!corner) {
          corner = event.latlng;
          setHint("First corner selected — click the opposite corner");
          cornerMarker?.remove();
          cornerMarker = L.circleMarker(corner, { radius: 5 }).addTo(map);
          return;
        }
        const bounds = L.latLngBounds(corner, event.latlng);
        cornerMarker?.remove();
        cornerMarker = null;
        drawResizableRectangle(bounds);
        corner = null;
        setHint(
          "Rectangle selected. Drag either orange corner handle to resize it.",
        );
        notify(bounds);
      });
    const valid = points.filter(inIndia);
    points.forEach((p, i) => {
      if (!inIndia(p)) return;
      const color =
        statuses[i] === "visited"
          ? "#15803d"
          : ["skipped", "rescheduled"].includes(statuses[i])
            ? "#dc2626"
            : "#6b7280";
      const marker = L.marker(p, {
        bubblingMouseEvents: areaEnabled,
        icon: L.divIcon({
          className: "",
          html: `<span style="display:flex;align-items:center;justify-content:center;border:2px solid white;border-radius:50%;width:28px;height:28px;background:${color};color:white;font-weight:bold">${i + 1}</span>`,
        }),
      }).addTo(map);
      if (labels?.[i]) {
        const label = document.createElement("span");
        label.textContent = labels[i];
        marker.bindTooltip(label);
      }
    });
    if (valid.length) {
      if (!areaEnabled) L.polyline(valid, { color: "#f97316" }).addTo(map);
      for (const leg of areaEnabled ? [] : routeLegs(valid))
        L.marker(leg.midpoint, {
          interactive: false,
          icon: L.divIcon({
            className: "",
            html: `<span style="background:white;color:#9a3412;border:1px solid #fed7aa;border-radius:5px;padding:2px 5px;white-space:nowrap;font-size:11px;font-weight:bold">${leg.km.toFixed(2)} km</span>`,
          }),
        }).addTo(map);
      map.fitBounds(L.latLngBounds(valid), {
        padding: [30, 30],
        maxZoom: 15,
        animate: false,
      });
    }
    let fittedVisible=!!ref.current.clientHeight && !!ref.current.clientWidth;
    const resize = new ResizeObserver(() => {map.invalidateSize();if(!fittedVisible&&ref.current?.clientWidth&&ref.current?.clientHeight){fittedVisible=true;if(valid.length)map.fitBounds(L.latLngBounds(valid),{padding:[30,30],maxZoom:15,animate:false});}});
    resize.observe(ref.current);
    return () => {
      resize.disconnect();
      map.stop();
      map.remove();
    };
  }, [dataKey, areaEnabled]);
  return (
    <div className="space-y-2">
      {areaEnabled && (
        <div className="flex flex-wrap gap-3 items-center">
          <button
            type="button"
            disabled={!points.some(inIndia)}
            aria-pressed={selecting}
            onClick={() => {
              setSelecting(!selecting);
              setHint(
                !selecting
                  ? "Click the first corner, then the opposite corner"
                  : "",
              );
            }}
          >
            {selecting ? "Stop selecting" : "Select rectangle"}
          </button>
          <span role="status" className="text-sm text-slate-600">
            {hint || (points.some(inIndia) ? "Use Select rectangle, then click or tap two corners." : "No mapped eligible leads are available for rectangle selection.")}
          </span>
        </div>
      )}
      <div ref={ref} style={{height:420,width:"100%"}} className="rounded-xl" />
    </div>
  );
}
