const map = L.map('map', { preferCanvas: true }).setView([39.9526, -75.1636], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 80,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const septaDatasets = [
    {
        // phase 1 changes
        name: 'SEPTA Bus Stops - Fall 2026',
        url: 'data/septa_bus_stops_fall_2026.geojson',
        routeProperty: 'Line',
        color: '#e4572e',
    },
    {
        // before any changes
        name: 'SEPTA Bus Stops - Summer 2026',
        url: 'data/septa_bus_stops_summer_2026.geojson',
        routeProperty: 'Route',
        color: '#277da1',
    },
];

let selectedRoute = '';

async function loadSeptaDataset(dataset) {
    const response = await fetch(dataset.url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} loading ${dataset.url}`);
    }

    const data = await response.json();
    const layer = L.geoJSON(data, {
        filter: (feature) => (
            selectedRoute === ''
            || String(feature.properties?.[dataset.routeProperty]) === selectedRoute
        ),
        pointToLayer: (_feature, lat_lng) => L.circleMarker(lat_lng, {
            radius: 4,
            color: dataset.color,
            weight: 0.5,
            fillColor: dataset.color,
            fillOpacity: 0.75,
        }), 
        onEachFeature: function (feature, layer) {
        if (feature.properties && feature.properties.name) {
            layer.bindPopup("<b>" + feature.properties.name + "</b>");
        }},
    }).addTo(map);


    return { dataset, data, layer };
}

function onClick(datasets) {
    L.geoJSON(datasets, {
        onEachFeature: function (feature, layer) {
            // ensure feature has properties before binding
            if (feature.properties && feature.properties.popupContent) {
                layer.bindPopup(feature.properties.popupContent);
            }
        }
    }).addTo(map);
}

// drop down to filter routes
function addRouteFilter(datasets) {

    const routeValues = new Set();

    datasets.forEach(({ dataset, data }) => {
        data.features.forEach((feature) => {
            const route = feature.properties?.[dataset.routeProperty];
            if (route !== null && route !== undefined && String(route).trim() !== '') {
                routeValues.add(String(route));
            }
        });
    });

    const control = L.control({ position: 'topright' });
    control.onAdd = () => {
        const container = L.DomUtil.create('div', 'route-filter');
        const label = L.DomUtil.create('label', '', container);
        const select = L.DomUtil.create('select', '', container);

        label.htmlFor = 'route-filter-select';
        label.textContent = 'Route: ';
        select.id = 'route-filter-select';
        select.setAttribute('aria-label', 'Filter bus stops by route');

        const allRoutes = document.createElement('option');
        // value of dropdown intially (unselected)
        allRoutes.value = '';
        allRoutes.textContent = 'All Routes';
        select.appendChild(allRoutes);

        // spread syntax, make sure each route is only shown once (treat as set)
        // copy set into array so we can sort and do foreach
        [...routeValues]
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            // create dropdown option for each route, set route when selected
            .forEach((route) => {
                const option = document.createElement('option');
                option.value = route;
                option.textContent = route;
                select.appendChild(option);
            });

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);

        L.DomEvent.on(select, 'change', () => {
            selectedRoute = select.value;
            datasets.forEach(({ data, layer }) => {
                layer.clearLayers();
                layer.addData(data);
            });
        });

        return container;
    };
    control.addTo(map);
}

async function displaySeptaDatasets() {
    // even if one dataset fails, the other will still render
    const results = await Promise.allSettled(
        septaDatasets.map((dataset) => loadSeptaDataset(dataset)),
    );
    const overlays = {};
    const loadedDatasets = [];
    const bounds = L.latLngBounds();

    results.forEach((result, index) => {
        const dataset = septaDatasets[index];
        if (result.status === 'fulfilled') {
            loadedDatasets.push(result.value);
            overlays[dataset.name] = result.value.layer;
            bounds.extend(result.value.layer.getBounds());
        
        } 
        // throw error if dataset not displayed
        else {
            console.error(`Error - Could not display ${dataset.name}:`, result.reason);
        }
    });

    if (Object.keys(overlays).length > 0) {
        L.control.layers(null, overlays).addTo(map);
        addRouteFilter(loadedDatasets);
        map.fitBounds(bounds.pad(0.05));
    }
}

displaySeptaDatasets();

