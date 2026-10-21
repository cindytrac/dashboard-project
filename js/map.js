import { config, Map, MapStyle, Popup } from '@maptiler/sdk';

if (!window.MAPTILER_API_KEY) {
    throw new Error('Set a MapTiler API key in js/config.js before loading the map.');
}

config.apiKey = window.MAPTILER_API_KEY;

const map = new Map({
    container: document.getElementById('map'),
    style: MapStyle.BASIC,
    center: [-75.1636, 39.9526],
    zoom: 13,
});

const septaDatasets = [
    {
        id: 'fall-2026',
        name: 'SEPTA Bus Stops - Fall 2026',
        url: 'data/septa_bus_stops_fall_2026.geojson',
        routeProperty: 'Line',
        color: '#e4572e',
    },
    {
        id: 'summer-2026',
        name: 'SEPTA Bus Stops - Summer 2026',
        url: 'data/septa_bus_stops_summer_2026.geojson',
        routeProperty: 'Route',
        color: '#277da1',
    },
];

const changedRoutes = new Set([
    '17', '25', '44', '45', '49', '52', '53', 
    '57', '60', '61', '64', '79', '105',
]);

const discontinuedRoutes = new Set([
    '35', '47M', '62', '78', '80', '89', '106'
])

async function loadSeptaDataset(dataset) {
    const response = await fetch(dataset.url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} loading ${dataset.url}`);
    }

    const data = await response.json();
    const layerId = `stops-${dataset.id}`;
    map.addSource(dataset.id, {
        type: 'geojson',
        data,
    });
    map.addLayer({
        id: layerId,
        type: 'circle',
        source: dataset.id,
        paint: {
            'circle-radius': 4,
            'circle-color': dataset.color,
            'circle-stroke-color': dataset.color,
            'circle-stroke-width': 0.5,
            'circle-opacity': 0.75,
        },
    });

    // pop ups when you click a stop
    map.on('click', layerId, (event) => {
        const feature = event.features?.[0];
        const properties = feature?.properties;
        if (!properties) {
            return;
        }

        const route = properties[dataset.routeProperty];
        const stopName = properties.Stop_Name ?? properties.Stop ?? properties.name;
        const popupContent = document.createElement('div');

        if (stopName) {
            const name = document.createElement('strong');
            name.textContent = String(stopName);
            popupContent.appendChild(name);
        }

        if (route !== null && route !== undefined) {
            const routeStatus = document.createElement('p');
            routeStatus.textContent = changedRoutes.has(String(route))
                ? `Route ${route} changed`
                : `Route ${route} stayed the same`;
            popupContent.appendChild(routeStatus);
        }

        new Popup()
            .setLngLat(event.lngLat)
            .setDOMContent(popupContent)
            .addTo(map);
    });
    map.on('mouseenter', layerId, () => {
        map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', layerId, () => {
        map.getCanvas().style.cursor = '';
    });

    return { dataset, data, layerId };
}

function createRouteFilterControl(datasets) {
    const routeValues = new Set();
    datasets.forEach(({ dataset, data }) => {
        data.features.forEach((feature) => {
            const route = feature.properties?.[dataset.routeProperty];
            if (route !== null && route !== undefined && String(route).trim() !== '') {
                routeValues.add(String(route));
            }
        });
    });

    let container;
    return {
        onAdd() {
            container = document.createElement('div');
            container.className = 'maplibregl-ctrl maplibregl-ctrl-group route-filter';

            const label = document.createElement('label');
            label.htmlFor = 'route-filter-select';
            label.textContent = 'Route: ';

            const select = document.createElement('select');
            select.id = 'route-filter-select';
            select.setAttribute('aria-label', 'Filter bus stops by route');

            const resetButton = document.createElement('button');
            resetButton.type = 'button';
            resetButton.id = 'route-reset';
            resetButton.textContent = 'Reset';
            resetButton.setAttribute('aria-label', 'Reset filter');

            // sort routes in order
            const sortedRoutes = [...routeValues]
                .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

            const allRoutes = document.createElement('option');
            allRoutes.value = '';
            allRoutes.textContent = 'All Routes';
            select.appendChild(allRoutes);

            sortedRoutes.forEach((route) => {
                const option = document.createElement('option');
                option.value = route;
                option.textContent = route;
                select.appendChild(option);
            });

            const applyRouteFilter = () => {
                const selectedRoute = select.value;
                datasets.forEach(({ dataset, layerId }) => {
                    const filter = selectedRoute
                        ? ['==', ['to-string', ['get', dataset.routeProperty]], selectedRoute]
                        : null;
                    map.setFilter(layerId, filter);
                });
            };

            select.addEventListener('change', () => {
                applyRouteFilter();
            });

            resetButton.addEventListener('click', () => {
                select.value = '';
                applyRouteFilter();
            });

            container.append(label, select, resetButton);
            return container;
        },
        onRemove() {
            container?.remove();
        },
    };
}

function createLayerControl(datasets) {
    let container;
    return {
        onAdd() {
            container = document.createElement('div');
            container.className = 'maplibregl-ctrl maplibregl-ctrl-group route-layer-control';

            datasets.forEach(({ dataset, layerId }) => {
                const label = document.createElement('label');
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = true;
                checkbox.addEventListener('change', () => {
                    map.setLayoutProperty(
                        layerId,
                        'visibility',
                        checkbox.checked ? 'visible' : 'none',
                    );
                });
                label.append(checkbox, document.createTextNode(dataset.name));
                container.appendChild(label);
            });

            return container;
        },
        onRemove() {
            container?.remove();
        },
    };
}

function getDataBounds(datasets) {
    const bounds = {
        west: Infinity,
        south: Infinity,
        east: -Infinity,
        north: -Infinity,
    };

    function includeCoordinates(coordinates) {
        if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
            bounds.west = Math.min(bounds.west, coordinates[0]);
            bounds.east = Math.max(bounds.east, coordinates[0]);
            bounds.south = Math.min(bounds.south, coordinates[1]);
            bounds.north = Math.max(bounds.north, coordinates[1]);
            return;
        }
        coordinates.forEach(includeCoordinates);
    }

    datasets.forEach(({ data }) => {
        data.features.forEach((feature) => {
            if (feature.geometry?.coordinates) {
                includeCoordinates(feature.geometry.coordinates);
            }
        });
    });

    return bounds;
}

// popup to say whether or not the route changed
function didRouteChange(datasets) {
    

}

async function displaySeptaDatasets() {
    await new Promise((resolve) => map.once('load', resolve));

    const results = await Promise.allSettled(
        septaDatasets.map((dataset) => loadSeptaDataset(dataset)),
    );
    const loadedDatasets = [];

    results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
            loadedDatasets.push(result.value);
        } else {
            console.error(
                `Error - Could not display ${septaDatasets[index].name}:`,
                result.reason,
            );
        }
    });

    if (loadedDatasets.length === 0) {
        console.error('No SEPTA bus stop datasets could be displayed.');
        return;
    }

    map.addControl(createRouteFilterControl(loadedDatasets), 'top-left');
    map.addControl(createLayerControl(loadedDatasets), 'top-left');
    

    const bounds = getDataBounds(loadedDatasets);
    if (Number.isFinite(bounds.west)) {
        map.fitBounds(
            [[bounds.west, bounds.south], [bounds.east, bounds.north]],
            { padding: 40, maxZoom: 14 },
        );
    }
}

displaySeptaDatasets();
