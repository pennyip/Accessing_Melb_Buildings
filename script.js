//my mapbox unique access code
mapboxgl.accessToken = 'pk.eyJ1IjoiczQwMTY2OTgiLCJhIjoiY2x0b3lyMDcyMGtzcTJrcGFlN3ZzNnRtZyJ9.oc1p4S7lER0OXK8G6q1w8Q';

//setting the max bounds of the map. Leaving slightly wider than the dataset so that context can be given to user
var bounds = [
  [144.838858, -37.870314],
  [145.094719, -37.766712]
];


//adding the variable of the map container. 
var map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/s4016698/clvx9dv6h014i01rde4y6a4fo',
  maxBounds: bounds,
  zoom: 12.5,
  center: [144.956310, -37.827197],
  bearing: 35.20, //adjusting this will change the direction the view is facing
  pitch: 56.50 // adjusting this will change how up it is facing. Leaving this up slightly so the extrusions can be seen by default
});


//creating the variable for the accessibility rating layer.
var accessNames = ['0', '1', '2', '3'];
var circleColors = ['#a8eec7', '#6dbab9', '#5481a0', '#413D66']; //graduated colour scheme

//bringing the geojson in becasue mapbox tiles don't work for the hexbins or extrusions function
fetch('https://raw.githubusercontent.com/pennyip/OffStreet_Parking_melb/main/off_street_final.geojson')
  .then(response => response.json())
  .then(data => {
    map.on('load', function() {
    
    
    /// delete if it doesn't work
    var geocoder = new MapboxGeocoder({
    accessToken: mapboxgl.accessToken,
    mapboxgl: mapboxgl,
    placeholder: 'Search for an address',
    bbox: [144.838858, -37.870314, 145.094719, -37.766712],
    proximity: { longitude: 144.956310, latitude: -37.827197 }
  });

  // Append the geocoder to an existing HTML element or add it to the map
  document.getElementById('your-searchbar-container').appendChild(geocoder.onAdd(map));

  // Optional: Move the map to the selected location
  geocoder.on('result', function(e) {
    map.flyTo({
      center: e.result.geometry.coordinates,
      zoom: 14
    });
  });
    
    
    
      var bbox = turf.bbox(data);
      var cellSize = 0.08; //this is in kilometers as described below. Any smaller makes the map load super slowly. Any larger and there isn't much definition in the data being displayed.

      //using turf to create a hexgrid. The hexgrid will then be combined with the points within polygon to spatially join the data to hexgrid.
      var hexGrid = turf.hexGrid(bbox, cellSize, {
        units: 'kilometers'
      });

      //this section will create the points within
      hexGrid.features = hexGrid.features.map(hex => {
        hex.properties.parkingSpaces = 0;
        hex.properties.accessibilityRating = '0';
        var pointsWithin = turf.pointsWithinPolygon(data, hex).features;

        if (pointsWithin.length > 0) {
          pointsWithin.forEach(point => {
            hex.properties.parkingSpaces += point.properties['off_street_FeatureToPoin.MAX_Parking_spaces'];
          });

          hex.properties.accessibilityRating = pointsWithin[0].properties['buildings_info_FeatureToPoin.MAX_Accessibility_rating'];
        }

        return hex; // so hexbins only exist if there is data within the hexbin
      }).filter(hex => hex.properties.parkingSpaces > 0);


      //
      map.addSource('parking-data', {
        type: 'geojson',
        data: data //referring to data created by in turf bbox
      });

      map.addSource('hexbin', {
        type: 'geojson',
        data: hexGrid
      });

      //layer creating hexbin extrusion
      map.addLayer({
        id: 'hexbin-extrusion',
        type: 'fill-extrusion',
        source: 'hexbin', //referring to hexbin layer created with turf
        minzoom: 0, //set so that the hexbins are visible on small scale and disappear when zooming in to 14
        maxzoom: 14,
        paint: {
          'fill-extrusion-color': [
            'match',
            ['get', 'accessibilityRating'],
            '0', circleColors[0],
            '1', circleColors[1],
            '2', circleColors[2],
            '3', circleColors[3],
            '#d3d3d3'
          ],
          'fill-extrusion-height': [
            'step', // step chosen so that there is some similiarities in heights as opposed to interpolation
            ['get', 'parkingSpaces'],
            0,
            50, 100,
            100, 200,
            500, 400,
            1000, 600,
            2000, 800,
            3000, 1000,
            4000, 1200,
            5000, 1400,
            6000, 1600 //max 6000 car spaces
            // could alter this section to make more sense in terms of steps
          ],
          'fill-extrusion-opacity': 0.8, //needing slightly opaque to view what's behind
          'fill-extrusion-base': 0 // set as 0 to have the base on the map
        }
      });


      // Add a hexbin outline layer that remains visible after zooming in
      map.addLayer({
        id: 'hexbin-outline',
        type: 'line',
        source: 'hexbin',
        minzoom: 14, // outline appears when the hexbin extrusions disappear
        maxzoom: 22, // adjust according to how long you want the outlines to be visible
        paint: {
          'line-color': 'white', // white outline color
          'line-width': 1, // adjust the width of the outline
          'line-opacity': 0.2 // adjust the opacity if needed
        }
      });

      //popup function for the hexbin extrusion layer
      map.on('click', 'hexbin-extrusion', function(e) {
        var features = e.features;
        if (!features || features.length === 0) {
          return;
        }

        var feature = features[0];
        var properties = feature.properties;
        console.log('Feature Properties:', properties);

        //using these variables for the popup content
        var parkingSpaces = properties.parkingSpaces;
        var accessibilityRating = properties.accessibilityRating;
        var buildingCount = turf.pointsWithinPolygon(data, feature.geometry).features.length;
        var popupContent =
          'Average Accessibility Rating: ' + accessibilityRating + '<br>' +
          'Off-Street Parking Spaces: ' + parkingSpaces + '<br>' +
          'Building Count: ' + buildingCount; // important to know so that the viewer can make judgement of how dense the hexbin is

        //to refer to the css style
        new mapboxgl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(popupContent)
          .addTo(map);

        // prevent popups for nearest points from showing up
        e.stopPropagation();
      });


      //change cursor when hovering
      map.on('mouseenter', 'hexbin-extrusion', function() {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', 'hexbin-extrusion', function() {
        map.getCanvas().style.cursor = '';
      });

      // add this block using the GeoJSON data directly
      map.addSource('building-points-source', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/pennyip/OffStreet_Parking_melb/main/off_street_final.geojson'
      });

      // adding the building points layer
      map.addLayer({
        id: 'building-points',
        type: 'circle',
        source: 'building-points-source',
        minzoom: 14, // points are shown at large scale
        maxzoom: 22,
        paint: {
          'circle-color': [
            'match',
            ['get', 'buildings_info_FeatureToPoin.MAX_Accessibility_rating'],
            accessNames[0], circleColors[0],
            accessNames[1], circleColors[1],
            accessNames[2], circleColors[2],
            accessNames[3], circleColors[3],
            '#d3d3d3'
          ],
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            14, 3,
            22, 10, // this allows the circles to get larger as we zoom in
          ],
          'circle-pitch-alignment': 'map' //this aligns the circles flat on the map
        },
        layout: {
          'visibility': 'visible' // make the layer visible by default
        }
      });

      //popup for the building points
      map.on('click', 'building-points', function(e) {
        var features = e.features;
        if (!features || features.length === 0) {
          return;
        }

        var feature = features[0];
        var properties = feature.properties;
        console.log('Feature Properties:', properties);

        // Using these variables for the popup content
        var parkingSpaces = properties['off_street_FeatureToPoin.MAX_Parking_spaces'];
        var accessibilityRating = properties['buildings_info_FeatureToPoin.MAX_Accessibility_rating'];
        var buildingType = properties['off_street_FeatureToPoin.LAST_Parking_type'];
        var popupContent =
          'Parking Type: ' + buildingType + '<br>' +
          'Accessibility Rating: ' + accessibilityRating + '<br>' +
          'Off-Street Parking Spaces: ' + parkingSpaces;

        new mapboxgl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(popupContent)
          .addTo(map);

        // prevent popups for nearest points from showing up
        e.stopPropagation();
      });


      map.on('click', function(e) {
        // clears previous highlighted points
        clearPreviousHighlights();

        // this checks if the click is on a building point or hexbin, to not have 2 popups happen when clicking a hexbin or building points
        var featuresBuilding = map.queryRenderedFeatures(e.point, {
          layers: ['building-points']
        });
        var featuresHexbin = map.queryRenderedFeatures(e.point, {
          layers: ['hexbin-extrusion']
        });

        // for the nearest point highlight caluclations
        var nearestTaxiRank = findNearestFeature(e.lngLat, taxiRanksData);
        var nearestBusStop = findNearestFeature(e.lngLat, busStopsData);
        var nearestTrainStation = findNearestFeature(e.lngLat, trainStationsData);

        var nearestBuildingPoint = null;
        if (featuresBuilding.length) {
          nearestBuildingPoint = featuresBuilding[0];
        }

        var popupContent = '';

        if (nearestTaxiRank) {
          var taxiDistance = nearestTaxiRank.properties.distance;
          var taxiRankLocation = nearestTaxiRank.properties.loc_desc; // Retrieve the location description
          highlightNearestPoint(nearestTaxiRank, '#FFDF75');
          popupContent += 'Nearest Taxi Rank: ' + Math.round(taxiDistance) + ' meters<br>';
          popupContent += 'Rank Location: ' + taxiRankLocation + '<br>'; // Add the location description to the popup
        } else {
          popupContent += 'No taxi ranks nearby<br>';
        }

        if (nearestBusStop) {
          var busDistance = nearestBusStop.properties.distance;
          highlightNearestPoint(nearestBusStop, '#F3819A');
          popupContent += 'Nearest Bus Stop: ' + Math.round(busDistance) + ' meters<br>';
        } else {
          popupContent += 'No bus stops nearby<br>';
        }

        if (nearestTrainStation) {
          var trainDistance = nearestTrainStation.properties.distance;
          var trainStationName = nearestTrainStation.properties.station; // Retrieve the station name
          highlightNearestPoint(nearestTrainStation, '#90A35C');
          popupContent += 'Nearest Train Station : ' + Math.round(trainDistance) + ' meters<br>';
          popupContent += 'Station: ' + trainStationName + '<br>'; // Add the station name to the popup
        } else {
          popupContent += 'No train stations nearby<br>';
        }



        new mapboxgl.Popup({
            className: 'closest-distance-popup'
          })
          .setLngLat(e.lngLat)
          .setHTML(popupContent)
          .addTo(map);
      });

      // cursor change
      map.on('mouseenter', 'building-points', function() {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', 'building-points', function() {
        map.getCanvas().style.cursor = '';
      });

      // adding the taxi ranks layer (default is off)
      map.addSource('taxi-ranks', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/pennyip/OffStreet_Parking_melb/main/taxi-ranks.geojson'
      });

      map.addLayer({
        id: 'taxi-ranks',
        type: 'circle',
        source: 'taxi-ranks',
        paint: {
          'circle-color': '#FFDF75', // yellow color for taxi ranks
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            14, 3,
            22, 10,
          ],
          'circle-pitch-alignment': 'map' //this aligns the circles flat on the map
        },
        layout: {
          'visibility': 'none' // Start with the layer hidden
        }
      });

      // add train stations layer (default is off)
      map.addSource('train-stations', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/pennyip/OffStreet_Parking_melb/main/metro-train-stations-with-accessibility-information.geojson'
      });

      map.addLayer({
        id: 'train-stations',
        type: 'circle',
        source: 'train-stations',
        paint: {
          'circle-color': '#90A35C', // green colour for train stations
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            14, 3,
            22, 10,
          ],
          'circle-pitch-alignment': 'map' //this aligns the circles flat on the map
        },
        layout: {
          'visibility': 'none' // start with the layer hidden
        }
      });

      // adding bus stops layer (default is off)
      map.addSource('bus-stops', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/pennyip/OffStreet_Parking_melb/main/bus-stops.geojson'
      });

      map.addLayer({
        id: 'bus-stops',
        type: 'circle',
        source: 'bus-stops',
        paint: {
          'circle-color': '#F3819A', //
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            14, 3,
            22, 10,
          ],
          'circle-pitch-alignment': 'map' //this aligns the circles flat on the map
        },
        layout: {
          'visibility': 'none' // start with the layer hidden
        }
      });



      // this function will toggle the legend buttons on and off based on the accessibility rating which was defined earlier.
      function updateFiltersAndVisibility() {

        var filters = ['any']; // container for our active rating filters


        // individual filters for each button so that rating matches the button
        if (document.getElementById('ratingnone').classList.contains('active')) {
          filters.push(['any',
            ['!', ['has', 'buildings_info_FeatureToPoin.MAX_Accessibility_rating']],
            ['==', ['get', 'buildings_info_FeatureToPoin.MAX_Accessibility_rating'], null]
          ]);
        }

        if (document.getElementById('rating0').classList.contains('active')) {
          filters.push(['==', ['get', 'buildings_info_FeatureToPoin.MAX_Accessibility_rating'], '0']);
        }
        if (document.getElementById('rating1').classList.contains('active')) {
          filters.push(['==', ['get', 'buildings_info_FeatureToPoin.MAX_Accessibility_rating'], '1']);
        }
        if (document.getElementById('rating2').classList.contains('active')) {
          filters.push(['==', ['get', 'buildings_info_FeatureToPoin.MAX_Accessibility_rating'], '2']);
        }
        if (document.getElementById('rating3').classList.contains('active')) {
          filters.push(['==', ['get', 'buildings_info_FeatureToPoin.MAX_Accessibility_rating'], '3']);
        }


        // if no ratings are active, show nothing
        if (filters.length === 1) {
          map.setFilter('building-points', false);
        } else {
          map.setFilter('building-points', filters);
          map.setLayoutProperty('building-points', 'visibility', 'visible');
        }
      }

      // adding 'event listeners' to legend buttons to set them active by default
      ['ratingnone', 'rating0', 'rating1', 'rating2', 'rating3'].forEach(function(id, index) {
        var button = document.getElementById(id);
        button.classList.add('active');

        // set button colour to match the legend color
        if (id === 'ratingnone') {
          button.style.backgroundColor = '#d3d3d3'; // colour for ratingnone button
        } else {
          button.style.backgroundColor = circleColors[index - 1];
        }

        button.addEventListener('click', function() {
          this.classList.toggle('active');
          updateFiltersAndVisibility();
          if (this.classList.contains('active')) {
            if (id === 'ratingnone') {
              this.style.backgroundColor = '#d3d3d3'; // colour for ratingnone button
            } else {
              this.style.backgroundColor = circleColors[index - 1]; // Set color based on circleColors array
            }
          } else {
            this.style.backgroundColor = '';
          }
        });
      });

      updateFiltersAndVisibility();
    });

    // for the taxi ranks button
    document.getElementById('taxi-ranks').addEventListener('click', function() {
      var visibility = map.getLayoutProperty('taxi-ranks', 'visibility');
      map.setLayoutProperty('taxi-ranks', 'visibility', visibility === 'visible' ? 'none' : 'visible');

      // toggle button colour. This will change the colours when activated to match the point colours
      var button = document.getElementById('taxi-ranks');
      if (visibility === 'visible') {
        button.style.backgroundColor = ''; // reset to default colour
      } else {
        button.style.backgroundColor = '#FFDF75'; // set to point colour
      }
    });

    // for the train stations button
    document.getElementById('train-stations').addEventListener('click', function() {
      var visibility = map.getLayoutProperty('train-stations', 'visibility');
      map.setLayoutProperty('train-stations', 'visibility', visibility === 'visible' ? 'none' : 'visible');
      var button = document.getElementById('train-stations');
      if (visibility === 'visible') {
        button.style.backgroundColor = ''; // reset to default colour
      } else {
        button.style.backgroundColor = '#90A35C'; // set to point colour
      }
    });

    // for the bus stops button
    document.getElementById('bus-stops').addEventListener('click', function() {
      var visibility = map.getLayoutProperty('bus-stops', 'visibility');
      map.setLayoutProperty('bus-stops', 'visibility', visibility === 'visible' ? 'none' : 'visible');

      // toggle button colour for bus stops
      var button = document.getElementById('bus-stops');
      if (visibility === 'visible') {
        button.style.backgroundColor = ''; // reset to default colour
      } else {
        button.style.backgroundColor = '#F3819A'; // set to point colour
      }
    });


    //control button
    map.addControl(new mapboxgl.NavigationControl(), 'top-left');
  });

// Variables to store GeoJSON data for the sources
let taxiRanksData, busStopsData, trainStationsData;

// fetch and store the data for each layer: taxi ranks, bus stops, train station. The highlight function didn't work when using vector tiles instead of geojson
fetch('https://raw.githubusercontent.com/pennyip/OffStreet_Parking_melb/main/taxi-ranks.geojson')
  .then(response => response.json())
  .then(data => {
    taxiRanksData = data;
  });

fetch('https://raw.githubusercontent.com/pennyip/OffStreet_Parking_melb/main/bus-stops.geojson')
  .then(response => response.json())
  .then(data => {
    busStopsData = data;
  });

fetch('https://raw.githubusercontent.com/pennyip/OffStreet_Parking_melb/main/metro-train-stations-with-accessibility-information.geojson')
  .then(response => response.json())
  .then(data => {
    trainStationsData = data;
  });

// this section is for the nearest point popup function. Again, this uses Turf.js function to calculate distance from the point
function findNearestFeature(clickedPoint, geojsonData) {
  if (!geojsonData) return null;

  var nearestDistance = Infinity;
  var nearestFeature = null;
  geojsonData.features.forEach(function(feature) {
    var distance = turf.distance(
      turf.point(clickedPoint.toArray()),
      turf.point(feature.geometry.coordinates)
    );
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestFeature = feature;
    }
  });
  if (nearestFeature) {
    nearestFeature.properties.distance = nearestDistance * 1000; // Convert distance to meters
  }
  return nearestFeature;
}

// now that the function has been calculated, this highlight function can highlight which points the popup is referring to.
function highlightNearestPoint(feature, color) {
  var id = 'highlight-' + Math.random().toString(36).substr(2, 9);
  map.addLayer({
    id: id,
    type: 'circle',
    source: {
      type: 'geojson', // required geojson to work properly
      data: feature
    },
    paint: {
      'circle-color': color,
      'circle-stroke-color': 'white',
      'circle-stroke-opacity': 0.5,
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        14, 6,
        22, 14, // made it larger than the exisiting building circles
      ],
      'circle-pitch-alignment': 'map' // this aligns the circles flat on the map
    }
  });

  // stores the layer id for later removal
  highlightedLayers.push(id);

  // removes the highlight after 4 seconds
  setTimeout(() => {
    map.removeLayer(id);
    var index = highlightedLayers.indexOf(id);
    if (index !== -1) {
      highlightedLayers.splice(index, 1);
    }
  }, 4000); // this is the equivalent to 4 seconds
}

function clearPreviousHighlights() {
  highlightedLayers.forEach(function(id) {
    if (map.getLayer(id)) {
      map.removeLayer(id);
    }
  });
  highlightedLayers = [];
}

//for the sidebar button to toggle expand and collapse it
document.getElementById('toggle-sidebar').addEventListener('click', function() {
  var sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('collapsed');
  this.classList.toggle('collapsed');
});


// required for the highlight building points and public transport points
var highlightedLayers = [];

// Toggle button for 2D/3D view
const toggleButton = document.getElementById('toggle-2d-3d');

// Function to update button text based on view mode
function updateButtonText() {
  const is3D = map.getPitch() > 0;
  toggleButton.textContent = is3D ? '3D' : '2D';
}

// Initialize button text based on the initial view mode
updateButtonText();

// Event listener for the toggle button
toggleButton.addEventListener('click', () => {
  const is3D = map.getPitch() > 0;
  if (is3D) {
    // Switch to 2D view
    map.easeTo({
      pitch: 0,
      bearing: 0,
      duration: 500
    });
  } else {
    // Switch to 3D view
    map.easeTo({
      pitch: 60, // Adjust pitch for 3D effect
      bearing: 30, // Adjust bearing for 3D effect
      duration: 500
    });
  }
  // Update button text after switching views
  updateButtonText();
});

